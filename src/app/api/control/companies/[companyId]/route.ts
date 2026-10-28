import { NextRequest, NextResponse } from 'next/server';
import { getCurrentSession } from '@/lib/auth/session';
import { CompanyDeletionService } from '@/server/services/company-deletion.service';

export const dynamic = 'force-dynamic';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { companyId: string } }
) {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized: Authentication required.' },
        { status: 401 }
      );
    }

    const { companyId } = params;
    if (!companyId) {
      return NextResponse.json(
        { success: false, message: 'Missing company ID parameter.' },
        { status: 400 }
      );
    }

    const result = await CompanyDeletionService.deleteCompanyAndWorkspace(companyId, session);

    return NextResponse.json(
      {
        success: result.success,
        message: result.message,
      },
      { status: result.statusCode || (result.success ? 200 : 500) }
    );
  } catch (err: any) {
    const statusCode = err.statusCode || 500;
    return NextResponse.json(
      {
        success: false,
        message: err.message || 'An unexpected error occurred during company deletion.',
      },
      { status: statusCode }
    );
  }
}
