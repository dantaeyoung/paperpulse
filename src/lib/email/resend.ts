import { Resend } from 'resend';

// Lazy initialization to avoid build-time errors
let resendClient: Resend | null = null;

function getResendClient(): Resend {
  if (!resendClient) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

// Using any types to avoid complex type dependencies
// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface DigestData {
  user: {
    name: string | null;
    email: string;
    token: string;
  };
  summaries: Array<{
    paper: {
      title: string;
      url: string;
      journal_name: string | null;
      published_at: string | null;
      authors: { name: string; affiliation?: string }[];
    };
    summary: {
      content: string;
    };
  }>;
}

function formatDateRange(): string {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const format = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
  return `${format(weekAgo)} - ${format(now)}`;
}

function formatAuthors(authors: { name: string; affiliation?: string }[]): string {
  if (!authors || authors.length === 0) return 'Unknown';
  if (authors.length === 1) return authors[0].name;
  if (authors.length === 2) return `${authors[0].name}, ${authors[1].name}`;
  return `${authors[0].name} 외 ${authors.length - 1}명`;
}

function generateEmailHTML(data: DigestData): string {
  const { user, summaries } = data;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://your-app.vercel.app';

  const summariesHTML = summaries.map(({ paper, summary }) => `
    <article style="background: #f9fafb; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
      <h2 style="font-size: 16px; margin: 0 0 8px; color: #1f2937;">
        <a href="${paper.url}" style="color: #2563eb; text-decoration: none;">${paper.title}</a>
      </h2>
      <p style="font-size: 13px; color: #6b7280; margin: 0 0 12px;">
        ${formatAuthors(paper.authors)} · ${paper.journal_name || 'Unknown Journal'} · ${paper.published_at || 'N/A'}
      </p>
      <p style="font-size: 14px; line-height: 1.6; color: #374151; margin: 0;">
        ${summary.content}
      </p>
    </article>
  `).join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>주간 논문 요약</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #ffffff;">

  <header style="border-bottom: 2px solid #2563eb; padding-bottom: 16px; margin-bottom: 24px;">
    <h1 style="color: #1e40af; margin: 0; font-size: 24px;">주간 논문 다이제스트</h1>
    <p style="color: #6b7280; margin: 8px 0 0;">${formatDateRange()}</p>
  </header>

  <p style="margin: 0 0 16px; color: #374151;">안녕하세요 ${user.name || '회원'}님,</p>
  <p style="margin: 0 0 24px; color: #374151;">이번 주 <strong>${summaries.length}편</strong>의 새 논문이 발견되었습니다.</p>

  ${summariesHTML}

  <footer style="border-top: 1px solid #e5e7eb; padding-top: 16px; margin-top: 24px; font-size: 12px; color: #9ca3af;">
    <p style="margin: 0 0 8px;">
      <a href="${baseUrl}/u/${user.token}" style="color: #2563eb;">설정 변경</a>
    </p>
    <p style="margin: 0;">이 이메일은 자동 발송되었습니다.</p>
  </footer>

</body>
</html>
`;
}

export async function sendDigestEmail(data: DigestData): Promise<{ success: boolean; error?: string }> {
  const { user, summaries } = data;

  if (summaries.length === 0) {
    return { success: true }; // No papers to send
  }

  try {
    const html = generateEmailHTML(data);
    const resend = getResendClient();

    await resend.emails.send({
      from: process.env.EMAIL_FROM || 'Paper Digest <onboarding@resend.dev>',
      to: user.email,
      subject: `[논문요약] ${summaries.length}편의 새 논문 (${formatDateRange()})`,
      html,
    });

    return { success: true };
  } catch (error) {
    console.error('Failed to send email:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
