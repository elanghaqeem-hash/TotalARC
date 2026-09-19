export type ControlEvidence = {
  todTests?: Array<{ conclusion?: string | null }>;
  toeTests?: Array<{ finalConclusion?: string | null }>;
  issues?: Array<{ severity?: string | null; status?: string | null }>;
  monitoringRules?: Array<{ lastStatus?: string | null }>;
};

export function deriveDesignAssessment(control: ControlEvidence) {
  return control.todTests?.[0]?.conclusion || 'Not Assessed';
}

export function deriveOperatingStatus(control: ControlEvidence) {
  return control.toeTests?.[0]?.finalConclusion || 'Not Assessed';
}

export function deriveControlHealth(control: ControlEvidence) {
  const tod = deriveDesignAssessment(control);
  const toe = deriveOperatingStatus(control);
  const openIssues = (control.issues || []).filter(issue => issue.status !== 'Closed');
  const seriousIssue = openIssues.some(issue => ['Critical','High'].includes(issue.severity || ''));
  const ccmException = (control.monitoringRules || []).some(rule => rule.lastStatus === 'Exception Detected');

  if (seriousIssue || toe === 'Ineffective') return 'Deficient';

  if (
    toe === 'Partially Effective' ||
    tod === 'Partially Effective Design' ||
    tod === 'Ineffective Design' ||
    ccmException ||
    openIssues.length > 0
  ) {
    return 'Attention Required';
  }

  const effectiveDesign = tod === 'Effective Design';
  const effectiveOperation = ['Effective','Effective with Minor Exception'].includes(toe);
  if (effectiveDesign && effectiveOperation) return 'Healthy';

  return 'Not Assessed';
}
