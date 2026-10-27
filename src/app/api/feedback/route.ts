import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 5;
let rateLimitBucket = { count: 0, resetAt: 0 };

const MAX_FEEDBACK_ATTACHMENTS = 3;
const MAX_FEEDBACK_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const MAX_FEEDBACK_TOTAL_BYTES = 20 * 1024 * 1024;

type FeedbackKind = 'bug' | 'suggestion' | 'feedback';

type ParsedFeedbackRequest = {
  kind?: FeedbackKind;
  title: string;
  details: string;
  contact: string;
  attachments: File[];
};

function checkRateLimit(): boolean {
  const now = Date.now();
  if (now >= rateLimitBucket.resetAt) {
    rateLimitBucket = { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS };
    return true;
  }
  if (rateLimitBucket.count >= RATE_LIMIT_MAX) return false;
  rateLimitBucket.count += 1;
  return true;
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1))}\u2026`;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

async function parseFeedbackRequest(request: NextRequest): Promise<ParsedFeedbackRequest> {
  const contentType = request.headers.get('content-type') || '';

  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData();
    return {
      kind: typeof formData.get('kind') === 'string' ? (formData.get('kind') as FeedbackKind) : undefined,
      title: typeof formData.get('title') === 'string' ? String(formData.get('title')) : '',
      details: typeof formData.get('details') === 'string' ? String(formData.get('details')) : '',
      contact: typeof formData.get('contact') === 'string' ? String(formData.get('contact')) : '',
      attachments: formData
        .getAll('attachments')
        .filter((entry): entry is File => typeof entry !== 'string' && entry.size > 0),
    };
  }

  const body = (await request.json()) as Record<string, unknown>;
  return {
    kind: typeof body.kind === 'string' ? (body.kind as FeedbackKind) : undefined,
    title: typeof body.title === 'string' ? body.title : '',
    details: typeof body.details === 'string' ? body.details : '',
    contact: typeof body.contact === 'string' ? body.contact : '',
    attachments: [],
  };
}

export async function POST(request: NextRequest) {
  try {
    const webhookUrl = process.env.DISCORD_FEEDBACK_WEBHOOK_URL;
    if (!webhookUrl) {
      return NextResponse.json({ error: 'Feedback endpoint is not configured yet' }, { status: 503 });
    }

    if (!checkRateLimit()) {
      return NextResponse.json({ error: 'Too many reports sent too quickly. Try again in a minute.' }, { status: 429 });
    }

    const parsed = await parseFeedbackRequest(request);
    const kind = parsed.kind;
    const title = parsed.title.trim();
    const details = parsed.details.trim();
    const contact = parsed.contact.trim();
    const attachments = parsed.attachments;

    if (!kind || !['bug', 'suggestion', 'feedback'].includes(kind)) {
      return NextResponse.json({ error: 'Invalid feedback type' }, { status: 400 });
    }
    if (title.length < 3 || title.length > 120) {
      return NextResponse.json({ error: 'Title must be between 3 and 120 characters' }, { status: 400 });
    }
    if (details.length < 10 || details.length > 2000) {
      return NextResponse.json({ error: 'Details must be between 10 and 2000 characters' }, { status: 400 });
    }
    if (contact.length > 120) {
      return NextResponse.json({ error: 'Contact must be 120 characters or fewer' }, { status: 400 });
    }

    if (attachments.length > MAX_FEEDBACK_ATTACHMENTS) {
      return NextResponse.json({ error: `You can attach up to ${MAX_FEEDBACK_ATTACHMENTS} files` }, { status: 400 });
    }
    const oversizedAttachment = attachments.find((file) => file.size > MAX_FEEDBACK_ATTACHMENT_BYTES);
    if (oversizedAttachment) {
      return NextResponse.json(
        { error: `${oversizedAttachment.name} is over ${formatFileSize(MAX_FEEDBACK_ATTACHMENT_BYTES)}` },
        { status: 400 },
      );
    }
    const totalAttachmentBytes = attachments.reduce((sum, file) => sum + file.size, 0);
    if (totalAttachmentBytes > MAX_FEEDBACK_TOTAL_BYTES) {
      return NextResponse.json(
        { error: `Attachments must stay under ${formatFileSize(MAX_FEEDBACK_TOTAL_BYTES)} total` },
        { status: 400 },
      );
    }

    const kindLabel =
      kind === 'bug' ? 'Bug Report' : kind === 'suggestion' ? 'Suggestion' : 'General Feedback';
    const color =
      kind === 'bug' ? 0xf23f43 : kind === 'suggestion' ? 0xf0b232 : 0x5865f2;

    const discordPayload = {
      username: 'Meowhook Feedback',
      embeds: [
        {
          title: `${kindLabel}: ${truncate(title, 120)}`,
          description: truncate(details, 4000),
          color,
          fields: [
            {
              name: 'Type',
              value: kindLabel,
              inline: true,
            },
            {
              name: 'Contact',
              value: contact ? truncate(contact, 120) : 'Not provided',
              inline: true,
            },
            ...(attachments.length > 0
              ? [{
                  name: 'Attachments',
                  value: truncate(
                    attachments.map((file) => `${file.name} (${formatFileSize(file.size)})`).join('\n'),
                    1024,
                  ),
                  inline: false,
                }]
              : []),
          ],
          footer: {
            text: 'Sent from the Meowhook feedback form',
          },
          timestamp: new Date().toISOString(),
        },
      ],
    };

    const discordResponse = attachments.length > 0
      ? await (async () => {
          const discordForm = new FormData();
          discordForm.set('payload_json', JSON.stringify(discordPayload));
          attachments.forEach((file, index) => {
            discordForm.append(`files[${index}]`, file, file.name);
          });
          return fetch(webhookUrl, {
            method: 'POST',
            body: discordForm,
          });
        })()
      : await fetch(webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(discordPayload),
        });

    if (!discordResponse.ok) {
      console.error('Discord feedback webhook error:', `status ${discordResponse.status}`);
      return NextResponse.json({ error: 'Discord rejected the feedback submission' }, { status: 502 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Feedback submission failed:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
