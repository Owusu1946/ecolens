import { type SQL, sql } from "drizzle-orm";
import { customType } from "drizzle-orm/pg-core";

// GeoJSON geometry columns for PostGIS. Values are written as GeoJSON and stored
// as `geometry(<Type>, 4326)` (WGS 84 lon/lat). Reads come back as GeoJSON from
// both core selects (EWKB decoded below) and relational queries (ST_AsGeoJSON).

export type Position = [number, number] | [number, number, number];
export type Point = { type: "Point"; coordinates: Position };
export type LineString = { type: "LineString"; coordinates: Position[] };
export type Polygon = { type: "Polygon"; coordinates: Position[][] };
export type MultiPoint = { type: "MultiPoint"; coordinates: Position[] };
export type MultiLineString = { type: "MultiLineString"; coordinates: Position[][] };
export type MultiPolygon = { type: "MultiPolygon"; coordinates: Position[][][] };
export type Geometry = Point | LineString | Polygon | MultiPoint | MultiLineString | MultiPolygon;

export const SRID = 4326;

type GeometryTypeName = Geometry["type"] | "Geometry";
type GeometryOf<T extends GeometryTypeName> = T extends Geometry["type"]
  ? Extract<Geometry, { type: T }>
  : Geometry;

export function geometry<T extends GeometryTypeName>(type: T) {
  return customType<{ data: GeometryOf<T>; driverData: string }>({
    dataType: () => `geometry(${type}, ${SRID})`,
    toDriver: (value): SQL =>
      sql`ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(value)}), ${SRID})`,
    fromDriver: (value) => decodeEwkb(value) as GeometryOf<T>,
    forJsonSelect: (identifier) => sql`ST_AsGeoJSON(${identifier})::json`,
    fromJson: (value) => value as GeometryOf<T>,
  })();
}

// --- EWKB (hex) → GeoJSON -------------------------------------------------

const WKB_TYPES = [
  "Geometry",
  "Point",
  "LineString",
  "Polygon",
  "MultiPoint",
  "MultiLineString",
  "MultiPolygon",
] as const;

const EWKB_Z = 0x80000000;
const EWKB_M = 0x40000000;
const EWKB_SRID = 0x20000000;

export function decodeEwkb(hex: string): Geometry {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  const view = new DataView(bytes.buffer);
  let offset = 0;

  function readGeometry(): Geometry {
    const little = view.getUint8(offset) === 1;
    offset += 1;
    const rawType = view.getUint32(offset, little);
    offset += 4;
    const hasZ = (rawType & EWKB_Z) !== 0;
    const hasM = (rawType & EWKB_M) !== 0;
    if (rawType & EWKB_SRID) {
      offset += 4;
    }
    const typeName = WKB_TYPES[rawType & 0xff];

    const u32 = () => {
      const v = view.getUint32(offset, little);
      offset += 4;
      return v;
    };
    const f64 = () => {
      const v = view.getFloat64(offset, little);
      offset += 8;
      return v;
    };
    const position = (): Position => {
      const x = f64();
      const y = f64();
      const z = hasZ ? f64() : undefined;
      if (hasM) f64();
      return z === undefined ? [x, y] : [x, y, z];
    };
    const ring = () => Array.from({ length: u32() }, position);
    const parts = <G extends Geometry>() =>
      Array.from({ length: u32() }, () => readGeometry() as G);

    switch (typeName) {
      case "Point":
        return { type: "Point", coordinates: position() };
      case "LineString":
        return { type: "LineString", coordinates: ring() };
      case "Polygon":
        return { type: "Polygon", coordinates: Array.from({ length: u32() }, ring) };
      case "MultiPoint":
        return { type: "MultiPoint", coordinates: parts<Point>().map((g) => g.coordinates) };
      case "MultiLineString":
        return {
          type: "MultiLineString",
          coordinates: parts<LineString>().map((g) => g.coordinates),
        };
      case "MultiPolygon":
        return { type: "MultiPolygon", coordinates: parts<Polygon>().map((g) => g.coordinates) };
      default:
        throw new Error(`Unsupported WKB geometry type ${rawType & 0xff}`);
    }
  }

  return readGeometry();
}
