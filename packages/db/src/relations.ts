import { defineRelations } from "drizzle-orm";

import * as schema from "./schema";

export const relations = defineRelations(schema, (r) => ({
  institutions: {
    dataSources: r.many.dataSources(),
    assignments: r.many.incidentAssignments(),
  },
  dataSources: {
    steward: r.one.institutions({
      from: r.dataSources.stewardInstitutionId,
      to: r.institutions.id,
    }),
    observations: r.many.observations(),
    boundaries: r.many.boundaries(),
  },
  sites: {
    observations: r.many.observations(),
    alerts: r.many.alerts(),
  },
  boundaries: {
    source: r.one.dataSources({
      from: r.boundaries.sourceId,
      to: r.dataSources.id,
      optional: false,
    }),
  },
  riverReaches: {
    source: r.one.dataSources({
      from: r.riverReaches.sourceId,
      to: r.dataSources.id,
      optional: false,
    }),
  },
  observations: {
    source: r.one.dataSources({
      from: r.observations.sourceId,
      to: r.dataSources.id,
      optional: false,
    }),
    site: r.one.sites({ from: r.observations.siteId, to: r.sites.id }),
  },
  alerts: {
    rule: r.one.anomalyRules({ from: r.alerts.ruleId, to: r.anomalyRules.id }),
    site: r.one.sites({ from: r.alerts.siteId, to: r.sites.id }),
    evidence: r.many.alertEvidence(),
    validations: r.many.validations(),
    fieldReports: r.many.fieldReports(),
    incident: r.one.incidents({ from: r.alerts.id, to: r.incidents.alertId }),
  },
  alertEvidence: {
    alert: r.one.alerts({ from: r.alertEvidence.alertId, to: r.alerts.id, optional: false }),
    observation: r.one.observations({ from: r.alertEvidence.observationId, to: r.observations.id }),
    fieldReport: r.one.fieldReports({ from: r.alertEvidence.fieldReportId, to: r.fieldReports.id }),
  },
  validations: {
    alert: r.one.alerts({ from: r.validations.alertId, to: r.alerts.id, optional: false }),
  },
  fieldReports: {
    alert: r.one.alerts({ from: r.fieldReports.alertId, to: r.alerts.id }),
    site: r.one.sites({ from: r.fieldReports.siteId, to: r.sites.id }),
    photos: r.many.fieldReportPhotos(),
  },
  fieldReportPhotos: {
    fieldReport: r.one.fieldReports({
      from: r.fieldReportPhotos.fieldReportId,
      to: r.fieldReports.id,
      optional: false,
    }),
  },
  incidents: {
    alert: r.one.alerts({ from: r.incidents.alertId, to: r.alerts.id, optional: false }),
    responsibleInstitution: r.one.institutions({
      from: r.incidents.responsibleInstitutionId,
      to: r.institutions.id,
    }),
    assignments: r.many.incidentAssignments(),
    actions: r.many.incidentActions(),
    reports: r.many.reports(),
  },
  incidentAssignments: {
    incident: r.one.incidents({
      from: r.incidentAssignments.incidentId,
      to: r.incidents.id,
      optional: false,
    }),
    institution: r.one.institutions({
      from: r.incidentAssignments.institutionId,
      to: r.institutions.id,
      optional: false,
    }),
  },
  incidentActions: {
    incident: r.one.incidents({
      from: r.incidentActions.incidentId,
      to: r.incidents.id,
      optional: false,
    }),
  },
  reports: {
    alert: r.one.alerts({ from: r.reports.alertId, to: r.alerts.id }),
    incident: r.one.incidents({ from: r.reports.incidentId, to: r.incidents.id }),
  },
}));
