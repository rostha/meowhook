# Discord application runtime

Meowhook uses signed HTTP interactions, so a persistent Gateway process is not required for the implemented buttons, menus, forms, slash commands, or context menu commands.

## Endpoint

`POST /api/discord/interactions/{botId}` runs in the Node.js runtime. The configured application public key verifies Ed25519 signatures over the untouched timestamp and request body. Requests outside a five-minute timestamp window, mismatched application IDs, malformed interactions, and bodies larger than 128 KiB are rejected. PING is answered only after signature verification.

Form-opening interactions return a modal immediately. Role changes and submitted forms receive an immediate private deferred response; `next/server`'s `after()` keeps the subsequent work running after the acknowledgement. The repository's atomic uniqueness constraint claims the Discord interaction ID before side effects. Duplicate delivery does not toggle a role twice or duplicate a saved response.

Custom IDs are version-independent references to stored configuration:

| ID | Meaning |
| --- | --- |
| `mh:action:{actionId}` | Reply, form launch, or role select |
| `mh:role:{actionId}:{roleId}` | Toggle one configured role |
| `mh:form:{formId}` | Open or submit a stored form |

Every lookup is scoped to application and server, and disabled configuration fails closed. Interactive IDs contain no bot token, session token, or user-supplied executable code.

## Supported interaction configuration

- Self-role button groups, string menus, and native role menus. A native role menu can display all server roles, but the runtime accepts only the saved allowlist. String menus display only that allowlist.
- Self roles require the bot's Manage Roles permission and a strictly higher bot role. Everyone, integration-managed roles, and roles granting moderation or administrative permissions in their global permissions or visible channel overwrites are rejected. Individual add/remove endpoints preserve unrelated roles.
- Forms use modern Label containers and support short text, paragraphs, string/user/role/mentionable/channel selects, uploads, radio groups, checkbox groups, and individual checkboxes. Discord permits at most five questions. Each answer is checked against the saved question type, choices, selection range, and text limits before persistence. Uploads retain Discord metadata and signed CDN URLs; Discord may expire these links, so they are not permanent hosted copies.
- Slash, user context, and message context commands. The stored response supports `{{user}}`, `{{username}}`, and `{{target}}`; the latter is the selected user/message ID. Commands may instead open a form or expose a saved action. Commands with a stored permission restriction enforce it at execution as well as registering it with Discord.
- Existing classic embeds and Components V2 payloads can have bot actions appended. Classic messages allow five action rows; V2 retains the forty-component total budget.

## Transport

The REST client sends credentials only to the fixed `https://discord.com/api/v10` origin and rejects redirects. Messages suppress automatic mentions. Hosted uploads use multipart requests with `payload_json`, numbered file fields, and attachment metadata. Each message accepts up to ten files, each no larger than 20 MiB. Creation supports stable nonces with `enforce_nonce`; the scheduling runner must separately preserve delivery state because Discord's nonce deduplication window is limited.

The client does not automatically retry mutations. HTTP 429 exposes a bounded `retryAfterMs`; 5xx and interrupted requests have uncertain outcomes and must not be blindly resent. Interaction response tokens are used without Bot authorization and are never persisted as form answers.

## Verification and external setup

`src/lib/bot/bot.test.ts` exercises signed HTTP, payload budgets, modal field types, role permission/hierarchy and allowlist checks, command types, deferred execution, replay deduplication, answer validation, fixed-origin requests, nonce handling, and multipart boundaries with mocked Discord transport. Live Discord installation and command delivery require an application configured with its server-side credentials and this interactions endpoint; those cannot be proved by local mocks.

Official references: [Receiving and responding](https://docs.discord.com/developers/interactions/receiving-and-responding), [application commands](https://docs.discord.com/developers/interactions/application-commands), [component reference](https://docs.discord.com/developers/components/reference), [permissions](https://docs.discord.com/developers/topics/permissions).
