import { Resend } from 'resend';

const resendApiKey = process.env.RESEND_API_KEY;
const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'CondoCorp <onboarding@resend.dev>';
const frontendUrl = (process.env.FRONTEND_URL ?? 'http://localhost:5173').replace(/\/$/, '');

const roleLabels: Record<string, string> = {
  condocorp_admin: 'CondoCorp Admin',
  board_member: 'Board Member',
  homeowner: 'Homeowner',
  property_manager: 'Property Manager',
};

function getResend(): Resend {
  if (!resendApiKey) {
    throw new Error('RESEND_API_KEY is not configured');
  }
  return new Resend(resendApiKey);
}

export async function sendInviteEmail(params: {
  to: string;
  condocorpName: string;
  role: string;
  inviterName: string;
}): Promise<void> {
  const signupUrl = `${frontendUrl}/signup?email=${encodeURIComponent(params.to)}`;
  const roleLabel = roleLabels[params.role] ?? params.role;

  const { error } = await getResend().emails.send({
    from: fromEmail,
    to: params.to,
    subject: `You're invited to ${params.condocorpName} on CondoCorp`,
    html: `
      <p>Hi,</p>
      <p><strong>${escapeHtml(params.inviterName)}</strong> invited you to join <strong>${escapeHtml(params.condocorpName)}</strong> on CondoCorp as a <strong>${escapeHtml(roleLabel)}</strong>.</p>
      <p><a href="${signupUrl}">Accept your invitation</a> — set a password or continue with Google using this email address. This invitation expires in 7 days.</p>
      <p>If the link does not work, copy and paste this URL into your browser:</p>
      <p><a href="${signupUrl}">${signupUrl}</a></p>
      <p>— CondoCorp Knowledge Assistant</p>
    `,
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function sendAddedToCorpEmail(params: {
  to: string;
  condocorpName: string;
  role: string;
}): Promise<void> {
  const loginUrl = `${frontendUrl}/login`;
  const roleLabel = roleLabels[params.role] ?? params.role;

  const { error } = await getResend().emails.send({
    from: fromEmail,
    to: params.to,
    subject: `You've been added to ${params.condocorpName} on CondoCorp`,
    html: `
      <p>Hi,</p>
      <p>You've been added to <strong>${escapeHtml(params.condocorpName)}</strong> on CondoCorp as a <strong>${escapeHtml(roleLabel)}</strong>.</p>
      <p><a href="${loginUrl}">Sign in</a> to access your condo corporation.</p>
      <p>— CondoCorp Knowledge Assistant</p>
    `,
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function sendPasswordResetEmail(params: { to: string; resetToken: string }): Promise<void> {
  const resetUrl = `${frontendUrl}/reset-password?token=${encodeURIComponent(params.resetToken)}`;

  const { error } = await getResend().emails.send({
    from: fromEmail,
    to: params.to,
    subject: 'Reset your CondoCorp password',
    html: `
      <p>Hi,</p>
      <p>We received a request to reset the password for your CondoCorp account.</p>
      <p><a href="${resetUrl}">Reset your password</a> — this link expires in 1 hour.</p>
      <p>If you did not request this, you can ignore this email. Your password will not change.</p>
      <p>If the link does not work, copy and paste this URL into your browser:</p>
      <p><a href="${resetUrl}">${resetUrl}</a></p>
      <p>— CondoCorp Knowledge Assistant</p>
    `,
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function sendGoogleSignInReminderEmail(params: { to: string }): Promise<void> {
  const loginUrl = `${frontendUrl}/login?email=${encodeURIComponent(params.to)}`;

  const { error } = await getResend().emails.send({
    from: fromEmail,
    to: params.to,
    subject: 'Sign in to CondoCorp with Google',
    html: `
      <p>Hi,</p>
      <p>We received a password reset request for this email address, but your account uses Google sign-in.</p>
      <p><a href="${loginUrl}">Sign in with Google</a> instead of resetting a password.</p>
      <p>— CondoCorp Knowledge Assistant</p>
    `,
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function sendTicketCreatedEmail(params: {
  to: string;
  condocorpName: string;
  subject: string;
  submitterName: string;
  ticketId: string;
}): Promise<void> {
  const ticketsUrl = `${frontendUrl}/tickets`;

  const { error } = await getResend().emails.send({
    from: fromEmail,
    to: params.to,
    subject: `[CondoCorp] New support ticket: ${params.subject}`,
    html: `
      <p>Hi,</p>
      <p><strong>${escapeHtml(params.submitterName)}</strong> submitted a support ticket for <strong>${escapeHtml(params.condocorpName)}</strong>.</p>
      <p><strong>Subject:</strong> ${escapeHtml(params.subject)}</p>
      <p><a href="${ticketsUrl}">View and respond to tickets</a></p>
      <p>— CondoCorp Knowledge Assistant</p>
    `,
  });

  if (error) {
    throw new Error(error.message);
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
