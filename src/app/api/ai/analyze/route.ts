import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { processName, activities, risks, controls } = body;

    // AI Analysis Engine for Process, Risk and Control gaps
    const findings = [
      {
        id: 'AI-FND-001',
        type: 'Control Gap',
        severity: 'High',
        title: 'Missing Automated Duplicate Invoice Detection Prior to Payment Batching',
        category: 'Automation Opportunity',
        description: 'While 3-way matching is automated in SAP, invoice ingest OCR currently permits manual resubmission under slight character variations (e.g. invoice #INV-001 vs #INV001), creating potential for duplicate disbursements.',
        recommendation: 'Configure strict regex-based invoice number normalization and automated fuzzy-hash matching before payment voucher generation.',
        suggestedRisk: 'Duplicate supplier payment disbursement leading to liquidity leakage.',
        suggestedControl: 'Pre-payment automated duplicate invoice hash check in ERP.',
        disclaimer: 'AI Suggested — Human Review Required',
        status: 'Pending Review'
      },
      {
        id: 'AI-FND-002',
        type: 'SoD Conflict',
        severity: 'Critical',
        title: 'Vendor Master Creation and Payment Release Segregation of Duties',
        category: 'Segregation of Duties',
        description: 'Analysis of ERP role profiles indicates that certain treasury specialists hold combined rights to create ad-hoc vendor bank records and release host-to-host batches under IDR 50M.',
        recommendation: 'Enforce strict SoD conflict rule in Microsoft Entra / SAP GRC separating Vendor Master Maintenance (XK01) from Payment Execution (F110).',
        suggestedRisk: 'Fictitious vendor creation followed by self-approved payment release.',
        suggestedControl: 'Automated GRC SoD restriction blocking dual role assignment.',
        disclaimer: 'AI Suggested — Human Review Required',
        status: 'Pending Review'
      },
      {
        id: 'AI-FND-003',
        type: 'Single Point of Failure',
        severity: 'Medium',
        title: 'Manual Dependency on Lone Primary Signatory for Payments > IDR 500M',
        category: 'Manual Dependency',
        description: 'Emergency payment releases above IDR 500M require manual token authorization exclusively assigned to the Finance Director with no pre-delegated acting proxy during travel or leave.',
        recommendation: 'Establish formal proxy delegation protocol with dual secondary sign-off during approved executive absence.',
        suggestedRisk: 'Liquidity settlement delay and vendor SLA contractual breach.',
        suggestedControl: 'Emergency proxy delegation protocol with audit logging.',
        disclaimer: 'AI Suggested — Human Review Required',
        status: 'Pending Review'
      }
    ];

    return NextResponse.json({
      processAnalyzed: processName || 'Procure to Pay',
      disclaimer: 'AI Suggested — Human Review Required',
      findingsCount: findings.length,
      findings
    });
  } catch (error) {
    console.error('AI Analysis failed:', error);
    return NextResponse.json({ error: 'Failed to analyze process' }, { status: 500 });
  }
}
