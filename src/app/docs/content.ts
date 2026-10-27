export type Guide = { id: string; group: string; title: string; intro: string; steps: {title:string;text:string}[]; details: {title:string;text:string}[]; tip:string; related:string[] };
export const groups = ["Getting started","Text & embeds","Advanced V2","Save & send","Bot workspace"];
const botGuides: Guide[] = [
  {
    id: 'dashboard', group: 'Bot workspace', title: 'Your account workspace',
    intro: 'Keep messages in your account and add interactions for your community.',
    steps: [
      { title: 'Open Dashboard', text: 'Choose Dashboard in the toolbar and sign in or create an account. You can continue using the webhook editor without an account.' },
      { title: 'Save a message', text: 'Use Save to account in the editor, or create a message in Dashboard → Messages. The dashboard includes the visual embed and V2 editors, JSON, files, and Preview.' },
      { title: 'Connect your community', text: 'Servers shows communities where your connected Discord account can manage the server. Add the bot to a server before publishing interactive messages.' },
    ],
    details: [
      { title: 'Browser drafts and account messages', text: 'Local drafts stay in this browser. Save to account copies the current message to your dashboard. Open in full editor adds a local copy without replacing your other drafts.' },
      { title: 'Connection state', text: 'You can build and save before a bot is connected. Sending, server roles, and app command publishing become available when the bot connection is ready.' },
    ],
    tip: 'The bot posts with its Discord name and avatar. Per-message webhook identity settings apply to webhook delivery.',
    related: ['self-roles', 'discord-forms', 'scheduled-messages', 'app-commands'],
  },
  {
    id: 'self-roles', group: 'Bot workspace', title: 'Buttons and self-role menus',
    intro: 'Let members choose roles, open forms, or receive a private reply.',
    steps: [
      { title: 'Create an action', text: 'In Buttons & roles, choose self roles, a form button, or a private reply. Pick a label, button style, and optional Unicode or custom Discord emoji.' },
      { title: 'Choose the control', text: 'Self roles can use buttons, a dropdown containing your choices, or Discord’s native role picker. Choose exactly which roles members may assign.' },
      { title: 'Attach and send', text: 'Edit a saved message, select its interactive actions, and check Preview. Choose a server and channel, then send it through the bot.' },
    ],
    details: [
      { title: 'Role permissions', text: 'The bot needs Manage Roles and its role must sit above the roles you offer. Administrator, moderation, everyone, and integration-managed roles cannot be self assigned.' },
      { title: 'Native role picker', text: 'Discord may display more roles in its native picker. Only roles on your saved allowlist are accepted. Use the regular dropdown to show only your choices.' },
    ], tip: 'Use a link button for a website. Use a saved action for a role, form, or private bot reply.',
    related: ['dashboard', 'discord-forms', 'links'],
  },
  {
    id: 'discord-forms', group: 'Bot workspace', title: 'Discord forms and responses',
    intro: 'Collect applications, feedback, and other answers inside Discord.',
    steps: [
      { title: 'Build the questions', text: 'Open Forms and add up to five questions. Choose text, choices, user or role pickers, channels, files, radio buttons, or checkboxes. Set required answers and sensible limits.' },
      { title: 'Give members a way in', text: 'Create a form-opening action and attach it to a message, or choose the form as an app command’s response.' },
      { title: 'Review answers', text: 'Open Responses to read submissions. An optional notification channel receives a summary after the response is saved.' },
    ],
    details: [
      { title: 'Who can see responses?', text: 'Responses appear in the form owner’s account. A notification channel can expose answers to members who can read that channel, so choose it carefully.' },
      { title: 'Uploaded answers', text: 'File answers include Discord attachment links. Discord can expire those links; download files you need to retain.' },
    ], tip: 'A form opens when someone uses a bot button or command. It cannot be opened by an ordinary webhook link button.',
    related: ['dashboard', 'self-roles', 'app-commands'],
  },
  {
    id: 'scheduled-messages', group: 'Bot workspace', title: 'Schedule a message',
    intro: 'Send a saved bot message once, daily, or on selected weekdays.',
    steps: [
      { title: 'Choose a saved message', text: 'Open Schedules, choose your message, and select the server and channel.' },
      { title: 'Set the time', text: 'Choose once or a repeating schedule. All dates and clock times use the named timezone you select. Changing that timezone keeps the shown clock values and changes when they occur.' },
      { title: 'Manage delivery', text: 'Pause, resume, cancel, or edit a schedule from your dashboard. You do not need to keep the website open for a configured scheduler to deliver it.' },
    ],
    details: [
      { title: 'Saved snapshot', text: 'Scheduling stores a copy of the message. Later message edits do not silently change an existing scheduled delivery; editing the schedule refreshes its copy from the chosen message.' },
      { title: 'An uncertain delivery', text: 'If Discord might have received a message but no receipt came back, the schedule stops instead of posting it again. Check the channel before creating another delivery.' },
    ], tip: 'Pausing or cancelling stops future work. A Discord request already in progress can still finish.',
    related: ['dashboard', 'self-roles'],
  },
  {
    id: 'app-commands', group: 'Bot workspace', title: 'Slash and right-click commands',
    intro: 'Make your bot available from Discord’s command picker and Apps menus.',
    steps: [
      { title: 'Choose where it appears', text: 'Create a slash command, a user command, or a message command. User and message commands appear under Apps when someone right-clicks that item in Discord.' },
      { title: 'Choose the response', text: 'Return a private reply, open a saved form, or expose a saved action. You can set a permission restriction for the command.' },
      { title: 'Publish your changes', text: 'Sync the server’s commands after adding, changing, disabling, or deleting them. Publishing includes saved commands from other administrators using this bot in the same server.' },
    ],
    details: [
      { title: 'Reply placeholders', text: 'Use {{user}} for the invoking user’s ID, {{username}} for their display name, and {{target}} for the user or message selected by a right-click command.' },
      { title: 'Command names', text: 'Slash names use lowercase letters, numbers, hyphens, or underscores and need a short description. Right-click commands can use readable names with spaces.' },
    ], tip: 'Sync publishes to Discord. Saving a command keeps it in your dashboard until you publish.',
    related: ['dashboard', 'discord-forms', 'self-roles'],
  },
];
export const guides: Guide[] = [
  {
    "id": "first-message",
    "group": "Getting started",
    "title": "Send your first message",
    "intro": "Start with a sentence. You can build and preview the whole message before connecting it to Discord.",
    "steps": [
      {
        "title": "Write something",
        "text": "Open Content in Message 1 and type a short announcement. The preview updates as you write."
      },
      {
        "title": "Choose the destination",
        "text": "Paste your Discord webhook URL into Webhook URL. Wait for the ready message and check the webhook name."
      },
      {
        "title": "Check, then send",
        "text": "Read the preview, fix any warnings, and press Send. Open your Discord channel to see the finished message."
      }
    ],
    "details": [
      {
        "title": "What is a webhook?",
        "text": "It is a posting address for a Discord channel. Meowhook sends your message to that address. You do not need a bot or a Meowhook account."
      },
      {
        "title": "Try things here first",
        "text": "The examples in this handbook are practice areas. They do not change your drafts or post to Discord."
      }
    ],
    "tip": "Keep your webhook URL private. Anyone who has it can post through that webhook.",
    "related": [
      "webhooks",
      "text",
      "embeds"
    ]
  },
  {
    "id": "workspace",
    "group": "Getting started",
    "title": "Find your way around",
    "intro": "Drafts on the left, writing in the middle, and a preview beside it. Make the space work for you.",
    "steps": [
      {
        "title": "Choose a draft",
        "text": "Use New for a separate draft, the pencil to rename it, and the handle to change its order."
      },
      {
        "title": "Open what you need",
        "text": "Section headings expand and collapse. The button beside Webhook URL compacts all message sections. Embeds have a separate compact-all control."
      },
      {
        "title": "Make room",
        "text": "Drag the editor/preview divider. On a phone, use Editor and Preview at the top, and the menu button for drafts."
      }
    ],
    "details": [
      {
        "title": "Jump from the preview",
        "text": "Click message text, an embed, or the profile to return to its editor. Desktop preview zoom changes only the preview size."
      },
      {
        "title": "Build a sequence",
        "text": "Add Message creates another message in the draft. Duplicate copies one for a variation. Removing a draft message does not delete a sent Discord message."
      }
    ],
    "tip": "The preview is an approximation. Discord can render fonts, media, and narrow layouts differently.",
    "related": [
      "drafts",
      "sending",
      "advanced"
    ]
  },
  {
    "id": "webhooks",
    "group": "Getting started",
    "title": "Connect a Discord channel",
    "intro": "Create a webhook once, then reuse it whenever you want to post to that channel.",
    "steps": [
      {
        "title": "Create it in Discord",
        "text": "Open channel settings → Integrations → Webhooks. Create a webhook and copy its URL. If those controls are missing, ask someone with permission to manage webhooks."
      },
      {
        "title": "Paste the address",
        "text": "Paste it into Webhook URL in Meowhook and wait for the ready message."
      },
      {
        "title": "Save it for later",
        "text": "The bookmark beside a valid URL saves it in this browser. The saved-webhooks control lets you choose, rename, and remove saved addresses."
      }
    ],
    "details": [
      {
        "title": "The eye reveals the URL",
        "text": "Hiding the URL keeps it off your screen. It does not encrypt it or remove it from browser storage."
      },
      {
        "title": "Give destinations clear names",
        "text": "Names like “Test channel” and “Announcements” make saved webhooks easier to tell apart. Check the destination in Discord before posting."
      }
    ],
    "tip": "If a webhook URL is exposed, delete or replace that webhook in Discord.",
    "related": [
      "first-message",
      "profile",
      "sharing"
    ]
  },
  {
    "id": "text",
    "group": "Text & embeds",
    "title": "Write and format text",
    "intro": "Write naturally first. Add a heading, a little emphasis, or a link where it helps someone read.",
    "steps": [
      {
        "title": "Start in Content",
        "text": "Write your message. Regular message content allows up to 2,000 characters."
      },
      {
        "title": "Open the larger editor",
        "text": "Focus the text field and select its expand button. Select some text, then choose a formatting tool."
      },
      {
        "title": "Keep or undo your edits",
        "text": "Apply keeps the changes. Cancel, Close, and Escape restore the text from before you opened the larger editor. Its preview updates live."
      }
    ],
    "details": [
      {
        "title": "The whole formatting toolkit",
        "text": "Bold, italic, underline, strikethrough, bold italic, inline code, code blocks, spoilers, quotes, lists, links, H1–H3 headings, small text, tasks, and indentation are available. Start a line with #, ##, or ### followed by a space for a heading, or -# followed by a space for small text. Escapes inserts literal sequences such as \\n; Emoji inserts emoji."
      },
      {
        "title": "Mentions and timestamps",
        "text": "You can type <@user_id>, <@&role_id>, <#channel_id>, <:name:id>, or <t:UNIX_SECONDS:R>. Server-specific names and emoji may not fully resolve in preview. Check mentions before sending."
      }
    ],
    "tip": "Try **bold**, *italic*, __underline__, ~~strike~~, ||spoiler||, and [a link](https://example.com). Markdown is not HTML.",
    "related": [
      "embeds",
      "v2-text",
      "advanced"
    ]
  },
  {
    "id": "embeds",
    "group": "Text & embeds",
    "title": "Build an embed",
    "intro": "An embed is the familiar Discord card: a title, a description, a colored edge, and optional details.",
    "steps": [
      {
        "title": "Add the card",
        "text": "Open Embeds → Add embed. Give it a title and description. Choose an accent with the color picker or hex field."
      },
      {
        "title": "Link the title",
        "text": "Open Add a link to the title and paste a full website URL. You can leave the title unlinked too."
      },
      {
        "title": "Put cards in order",
        "text": "Use the arrows or drag handle to reorder. Drag between messages in this draft, duplicate a card, or delete one you do not need."
      }
    ],
    "details": [
      {
        "title": "Author, footer, and time",
        "text": "Author adds a name, link, and icon above the title. Footer & timestamp adds a closing note, an icon, and a date. Choose a date and time, use Set to Now, or clear the timestamp."
      },
      {
        "title": "Keep it readable",
        "text": "Put the main story in Description, short facts in Fields, and pictures in Images. Each message supports up to 10 embeds."
      }
    ],
    "tip": "Color alone is not enough. Add a title, description, complete field, or image so the embed has visible content.",
    "related": [
      "fields",
      "images",
      "text"
    ]
  },
  {
    "id": "fields",
    "group": "Text & embeds",
    "title": "Add fields and small details",
    "intro": "Fields are for the facts people want to scan: when, where, what to bring, or how to join.",
    "steps": [
      {
        "title": "Open Fields in an embed",
        "text": "Add a field. Fill in both its name and its value, such as “When” and “Friday, 7 PM”."
      },
      {
        "title": "Try Inline",
        "text": "Turn it on for short fields that should sit beside each other. Narrow screens and long values can change the number of columns."
      },
      {
        "title": "Finish the card",
        "text": "Author goes above the title. Footer & timestamp goes below the fields. Keep these shorter than the main description."
      }
    ],
    "details": [
      {
        "title": "Both halves matter",
        "text": "A half-filled field blocks sending. Complete it or remove it. You can add up to 25 fields to one embed."
      },
      {
        "title": "The budget is shared",
        "text": "All embed text in one message shares a 6,000-character budget, including names, values, titles, descriptions, author names, and footers."
      }
    ],
    "tip": "Leave Inline off for a field that needs a paragraph or several lines.",
    "related": [
      "embeds",
      "troubleshooting"
    ]
  },
  {
    "id": "images",
    "group": "Text & embeds",
    "title": "Add images and files",
    "intro": "Use a thumbnail beside your words, a main image for the big visual, and Files for downloads.",
    "steps": [
      {
        "title": "Pick the image position",
        "text": "Inside an embed, open Images. Thumbnail is the small image; Image is the larger one. Paste a public image URL or use the upload control beside the field."
      },
      {
        "title": "Attach a download",
        "text": "Open Files in the message and add files from your device. Remove anything you no longer want."
      },
      {
        "title": "Check the upload count",
        "text": "Files, uploaded embed images, and uploaded author/footer icons share 10 attachment slots per message. Public image URLs do not use upload slots."
      }
    ],
    "details": [
      {
        "title": "Use a direct image address",
        "text": "The URL should open the image itself, not a page containing it or a sign-in screen. Try it in a private browser window."
      },
      {
        "title": "Keep the originals",
        "text": "Local uploads can be restored in this browser. JSON exports and share links do not carry file bytes to another device; keep the files for re-uploading."
      }
    ],
    "tip": "V2 thumbnails and galleries can use public URLs or local uploads. Add a File block for a downloadable attachment.",
    "related": [
      "v2-gallery",
      "v2-thumbnail",
      "drafts"
    ]
  },
  {
    "id": "profile",
    "group": "Text & embeds",
    "title": "Choose a name and avatar",
    "intro": "Give a message its own profile, or leave the overrides blank to use the webhook’s name and avatar.",
    "steps": [
      {
        "title": "Open Name & avatar",
        "text": "These settings belong to the message you are editing."
      },
      {
        "title": "Write a display name",
        "text": "Clear it to use the webhook name again."
      },
      {
        "title": "Choose an avatar",
        "text": "Paste a public image URL, or connect your webhook and choose Upload. PNG, JPG, GIF, and WebP images up to 8 MB are supported. Uploaded avatars are hosted publicly and appear in your preview and sent message."
      }
    ],
    "details": [
      {
        "title": "Profile or author?",
        "text": "Name & avatar changes the profile above the message. An embed’s Author is a line inside the card. They are separate settings."
      }
    ],
    "tip": "These overrides do not rename your Discord server or channel.",
    "related": [
      "webhooks",
      "embeds"
    ]
  },
  {
    "id": "links",
    "group": "Text & embeds",
    "title": "Add buttons that open links",
    "intro": "Give people a clear next step, such as reading the rules or opening an event page.",
    "steps": [
      {
        "title": "Open Link buttons",
        "text": "In regular mode, find it below Embeds and choose Add link."
      },
      {
        "title": "Name the action",
        "text": "Add a short label, then the full destination URL including https://."
      },
      {
        "title": "Check the destination",
        "text": "The preview button opens the website. Make sure it goes where you intended."
      }
    ],
    "details": [
      {
        "title": "What these buttons do",
        "text": "They open websites. Role assignment, stored votes, select menus, and forms need a Discord app and are not supported in this ordinary webhook flow."
      },
      {
        "title": "Button limits",
        "text": "The regular editor accepts up to 25 link buttons, arranged in rows of five. Each V2 Link buttons block holds up to five. Button options adds an emoji or disables a button; an emoji-only button can leave its label blank."
      }
    ],
    "tip": "Every button needs a label and a valid HTTP or HTTPS destination.",
    "related": [
      "v2-container",
      "text"
    ]
  },
  {
    "id": "v2",
    "group": "Advanced V2",
    "title": "Meet Advanced V2 components",
    "intro": "For a more flexible message, arrange text, images, dividers, and buttons as blocks.",
    "steps": [
      {
        "title": "Turn on Advanced V2 components",
        "text": "The toggle stays at the top of each message. A text block gives you somewhere to start."
      },
      {
        "title": "Add a block",
        "text": "Choose Add component, then Text, Text + thumbnail, Text + link button, Media gallery, File, Separator, Container, or Link buttons."
      },
      {
        "title": "Arrange the message",
        "text": "Drag the grip beside a block’s name, or use its arrows. Blocks inside a container move within that card. The preview follows the order."
      }
    ],
    "details": [
      {
        "title": "Regular content stays in the draft",
        "text": "While drafting, switching on V2 makes editable blocks from your regular text and embeds. You can switch back before sending. Once a sent message is converted to V2, Discord cannot switch it back."
      },
      {
        "title": "Convert a sent message",
        "text": "Load a regular sent message, switch on Advanced V2, review the generated blocks, then press Update. Discord replaces its old text and embeds with the V2 layout. Uploaded files cannot come along; use hosted image URLs or send a new message."
      }
    ],
    "tip": "You do not need V2 for a normal embed or a link button. Use it when the layout needs more control.",
    "related": [
      "v2-container",
      "v2-text",
      "v2-gallery"
    ]
  },
  {
    "id": "v2-text",
    "group": "Advanced V2",
    "title": "V2: text blocks",
    "intro": "A heading, a paragraph, a list, or a small line between images. A text block can do any of those.",
    "steps": [
      {
        "title": "Choose Text",
        "text": "Use Add component → Text, or Add to container → Text for a block inside a card."
      },
      {
        "title": "Write with Markdown",
        "text": "Try “## Community night”, a new line, and a short introduction."
      },
      {
        "title": "Move it into place",
        "text": "Use the arrows to put it above an image or below another block."
      }
    ],
    "details": [
      {
        "title": "Remove unused blocks",
        "text": "A Text block cannot be empty when you send. Fill it in or remove it. All V2 text in one message shares a 4,000-character limit. The counter below the blocks shows what you have used."
      }
    ],
    "tip": "In V2, write in Text blocks. The regular Content box is not included in the V2 message.",
    "related": [
      "text",
      "v2-separator",
      "v2-container"
    ]
  },
  {
    "id": "v2-thumbnail",
    "group": "Advanced V2",
    "title": "V2: text beside a thumbnail",
    "intro": "Introduce an event, a person, or a release with a small image beside the words.",
    "steps": [
      {
        "title": "Add Text + thumbnail",
        "text": "Choose it from Add component or Add to container."
      },
      {
        "title": "Fill both parts",
        "text": "Write the introduction, then paste an image URL or choose Upload file. Add section text gives you up to three separate text blocks beside the same image."
      },
      {
        "title": "Describe the image",
        "text": "Use Image description to explain what the picture shows. Keep essential information in the text too."
      }
    ],
    "details": [
      {
        "title": "When to use a gallery",
        "text": "A thumbnail is a small visual beside the text. A gallery gives the image itself more room."
      }
    ],
    "tip": "Use Hide thumbnail as a spoiler when needed. You can also switch the accessory to a Link button without losing your thumbnail settings.",
    "related": [
      "v2-gallery",
      "v2-container",
      "images"
    ]
  },
  {
    "id": "v2-gallery",
    "group": "Advanced V2",
    "title": "V2: media galleries",
    "intro": "Give one image room to breathe, or collect several images into a gallery.",
    "steps": [
      {
        "title": "Add Media gallery",
        "text": "Choose Add component → Media gallery. Paste a direct image or video URL, or choose Upload file."
      },
      {
        "title": "Add pictures and descriptions",
        "text": "Write a description for each item. Add media creates another row. A gallery holds 1–10 images or videos; each item has its own Spoiler checkbox."
      },
      {
        "title": "Arrange or remove",
        "text": "The block arrows move the whole gallery. Remove image deletes one picture; Remove on the block deletes the gallery."
      }
    ],
    "details": [
      {
        "title": "Write useful descriptions",
        "text": "“The new studio layout with desks by the window” tells someone more than “image1”. Explain what matters about the image."
      },
      {
        "title": "Keep the source available",
        "text": "Private drive pages, local file paths, and login-only links are not public image URLs. Discord needs to reach the image when sending."
      }
    ],
    "tip": "Discord may crop or arrange a gallery differently across devices. Check the sent result when framing matters.",
    "related": [
      "images",
      "v2-thumbnail",
      "v2-container"
    ]
  },
  {
    "id": "v2-section",
    "group": "Advanced V2",
    "title": "V2: text beside a link button",
    "intro": "Put a short explanation and its next step on the same row.",
    "steps": [
      {
        "title": "Add Text + link button",
        "text": "Choose it from Add component or Add inside container. A section can use a link button or a thumbnail."
      },
      {
        "title": "Write the words",
        "text": "Start with the first text box. Add section text adds a second or third box. Each one has the expanded Markdown editor."
      },
      {
        "title": "Set the destination",
        "text": "Give the button a short label and a full HTTP or HTTPS URL. Open Button options to add an emoji or disable it."
      }
    ],
    "details": [
      {
        "title": "Keep it simple",
        "text": "Leave the label blank if you want an emoji-only button. Paste a normal emoji, or a Discord custom emoji in the form <:name:123456789012345678>."
      },
      {
        "title": "Find the right control",
        "text": "Click the section’s text in the workspace preview to focus that text box. Click its button to focus the button label."
      }
    ],
    "tip": "These buttons open websites. Dropdowns, action buttons, and Discord forms need an application and are not available through an ordinary webhook.",
    "related": [
      "v2-thumbnail",
      "links",
      "v2-container"
    ]
  },
  {
    "id": "v2-files",
    "group": "Advanced V2",
    "title": "V2: share a downloadable file",
    "intro": "Add a guide, document, audio file, or another download where it belongs in your message.",
    "steps": [
      {
        "title": "Add a File block",
        "text": "Choose File from Add component or Add inside container."
      },
      {
        "title": "Choose or upload the file",
        "text": "Upload file opens the file chooser. If this draft already has uploads, choose one from Attached file. A File block needs an attachment, not a website URL."
      },
      {
        "title": "Check the preview",
        "text": "The file card shows its name and size. Hide file as a spoiler makes people reveal it first. Arrange it with the block grip or arrows."
      }
    ],
    "details": [
      {
        "title": "Files stay with the layout",
        "text": "Only uploads referenced by your V2 blocks are sent. One uploaded file can be reused in several blocks without being uploaded several times."
      },
      {
        "title": "Editing an existing message",
        "text": "Load the message before editing it. Its attached files are retained when you change the text. Removing the last block that uses a file removes that attachment on Update."
      },
      {
        "title": "Save and share",
        "text": "Uploads are saved in this browser. JSON and share links do not include the file bytes; on another device you need to upload them again."
      }
    ],
    "tip": "Up to 10 attachments can be sent in one message. Meowhook accepts up to 20 MiB per file, matching Discord’s default API limit. A boosted server may support more, but a webhook URL does not tell Meowhook its upload limit. Discord makes the final decision when sending.",
    "related": [
      "v2-gallery",
      "v2-container",
      "editing"
    ]
  },
  {
    "id": "v2-spoilers",
    "group": "Advanced V2",
    "title": "V2: hide a spoiler",
    "intro": "Let people choose when to reveal a picture, a download, or a whole card.",
    "steps": [
      {
        "title": "Choose what to hide",
        "text": "Thumbnails, gallery items, files, and containers each have a Spoiler checkbox. A container hides everything inside it."
      },
      {
        "title": "Try the reveal",
        "text": "The preview covers the content with a Reveal spoiler button. Click it to see what readers will uncover."
      },
      {
        "title": "Keep useful context visible",
        "text": "Write a short introduction outside the hidden container so people know what they are about to open."
      }
    ],
    "details": [
      {
        "title": "Text spoilers",
        "text": "For a few words inside a text block, use Discord Markdown: ||hidden words||. You do not need to hide the whole container."
      }
    ],
    "tip": "Spoilers hide content until it is revealed. They are not private messages or access controls.",
    "related": [
      "v2-files",
      "v2-gallery",
      "v2-container"
    ]
  },
  {
    "id": "v2-separator",
    "group": "Advanced V2",
    "title": "V2: lines and breathing room",
    "intro": "A separator gives two parts of your message space. Show a line, or keep the divider invisible.",
    "steps": [
      {
        "title": "Add Separator",
        "text": "Put it between the blocks you want to separate."
      },
      {
        "title": "Choose the line",
        "text": "Show line adds a visible divider. Turn it off for empty space only."
      },
      {
        "title": "Choose the spacing",
        "text": "Small keeps related parts close. Large gives a new section more room. Move it with the block arrows."
      }
    ],
    "details": [
      {
        "title": "Inside a container too",
        "text": "Separate an introduction from a gallery, or details from buttons, while keeping everything inside one card."
      }
    ],
    "tip": "Start with Small. Too many large gaps can make a short message feel much longer.",
    "related": [
      "v2-text",
      "v2-container"
    ]
  },
  {
    "id": "v2-container",
    "group": "Advanced V2",
    "title": "V2: put it all in a container",
    "intro": "Keep a heading, an image, the details, and a button together in one card.",
    "steps": [
      {
        "title": "Add a Container",
        "text": "Choose Add component → Container. Pick an accent color, or turn off Show accent color. A new container already includes a Text block."
      },
      {
        "title": "Build inside it",
        "text": "Write your heading in that Text block. Use Add to container to add a Media gallery, a File, a thumbnail or link section, a Separator, more Text, or Link buttons."
      },
      {
        "title": "Adjust the order",
        "text": "Drag the inner grips to arrange blocks inside the card. The container’s own grip moves the whole card. The arrows and keyboard arrow keys work too."
      }
    ],
    "details": [
      {
        "title": "Inside or outside?",
        "text": "Add component creates a block outside the container. Add to container creates one inside it. If you chose the wrong menu, recreate the block in the right place and remove the original."
      },
      {
        "title": "One level deep",
        "text": "You can have several containers, but cannot nest a container inside another. Removing a container also removes its children."
      }
    ],
    "tip": "Try the example: add text, an image, and a link inside the same container. Watch how the card grows.",
    "related": [
      "v2-text",
      "v2-gallery",
      "v2-separator",
      "links"
    ]
  },
  {
    "id": "drafts",
    "group": "Save & send",
    "title": "Keep your drafts and backups",
    "intro": "Your browser remembers your work. Backups give you a named point to return to before a big change.",
    "steps": [
      {
        "title": "Keep projects separate",
        "text": "Use New and rename drafts with the pencil. You can keep up to 10 drafts."
      },
      {
        "title": "Save a snapshot",
        "text": "In the sidebar, choose Save under Browser backups and name it. Restore a backup replaces the current collection with that snapshot."
      },
      {
        "title": "Move between devices",
        "text": "Export JSON downloads your drafts. Import JSON reads that file and replaces the current collection. Export the current work first if you need to keep it."
      }
    ],
    "details": [
      {
        "title": "Autosave is local",
        "text": "Wait for Autosaved before leaving. This is browser storage, not account sync. Clearing site data or changing browsers can leave drafts unavailable."
      },
      {
        "title": "Exports need care",
        "text": "Exports include draft settings and webhook URLs, but not local file bytes. Treat the file as private and keep original uploads."
      },
      {
        "title": "Deleting drafts",
        "text": "The delete control removes one draft. Clear all drafts starts over after confirmation. Keep a downloaded export for work you cannot replace."
      }
    ],
    "tip": "Follow save errors or conflict warnings before leaving. Avoid editing the same draft in two browser tabs at once.",
    "related": [
      "sharing",
      "templates",
      "json"
    ]
  },
  {
    "id": "sharing",
    "group": "Save & send",
    "title": "Share a message design",
    "intro": "Give someone an editable copy of your design. The share leaves out your webhook URL.",
    "steps": [
      {
        "title": "Choose Share this draft",
        "text": "Select the draft first, then open the sharing control in the sidebar."
      },
      {
        "title": "Set the duration",
        "text": "Choose 1, 3, 7, 14, or 30 days. Generate a link, then copy the address."
      },
      {
        "title": "Keep a received copy",
        "text": "Shared drafts open under Temporary for the browser session. Save a backup or export one you want to keep. Importing an export makes it persistent."
      }
    ],
    "details": [
      {
        "title": "What people can see",
        "text": "Anyone with the link can read the shared text, embed data, components, and public media URLs. Local uploads and webhook URLs are left out."
      },
      {
        "title": "Permanent fallback links",
        "text": "If the service is unavailable, Meowhook may offer a data link instead. It stores the design in the address and does not expire. Read the message beside the generated link."
      }
    ],
    "tip": "The share is a snapshot. Later edits do not update someone else’s copy.",
    "related": [
      "drafts",
      "images"
    ]
  },
  {
    "id": "templates",
    "group": "Save & send",
    "title": "Start from a template",
    "intro": "Get past the blank page, then make the names, links, dates, and details your own.",
    "steps": [
      {
        "title": "Browse Templates",
        "text": "Choose a category or search, then select an example to inspect it."
      },
      {
        "title": "Choose where it opens",
        "text": "Open as a new draft to keep your current work. Applying to the active draft replaces its messages; Undo restores the previous version."
      },
      {
        "title": "Save your own",
        "text": "Save a design you reuse as a custom template with a clear name. Custom templates live in this browser."
      }
    ],
    "details": [
      {
        "title": "Before you send",
        "text": "Replace all sample details, add the correct webhook, and read the whole preview. Remove fields or cards your message does not need."
      }
    ],
    "tip": "A template is a starting point. You can change every part of the message.",
    "related": [
      "embeds",
      "drafts",
      "v2-container"
    ]
  },
  {
    "id": "json",
    "group": "Save & send",
    "title": "Work with JSON",
    "intro": "JSON is your message written as data. Use it to bring in a payload or make a precise edit.",
    "steps": [
      {
        "title": "Open JSON",
        "text": "The toolbar editor shows one object for one message, or an array for several. The arrows beside line numbers fold sections."
      },
      {
        "title": "Edit and check",
        "text": "Format JSON makes it readable. Minify removes whitespace. Expand gives you room; Copy copies the current text."
      },
      {
        "title": "Apply to Editor",
        "text": "This replaces messages in the active draft. Fix any JSON error first. Undo in the builder can restore the earlier draft."
      }
    ],
    "details": [
      {
        "title": "V2 has a different shape",
        "text": "It uses components and the V2 flag instead of regular content and embeds. The visual editor builds this structure for you."
      },
      {
        "title": "Extra data settings",
        "text": "Supported JSON settings include tts and thread_name. These have no dedicated visual controls. A thread name is relevant when creating a forum or media-channel post through a webhook."
      }
    ],
    "tip": "Toolbar JSON edits active messages. Import JSON at the top of the sidebar loads a saved draft collection.",
    "related": [
      "drafts",
      "v2",
      "troubleshooting"
    ]
  },
  {
    "id": "sending",
    "group": "Save & send",
    "title": "Send a sequence and check results",
    "intro": "Send several messages in order, then check the result for each one.",
    "steps": [
      {
        "title": "Review the whole draft",
        "text": "Check every message and confirm the destination. Resolve warnings before sending."
      },
      {
        "title": "Press Send",
        "text": "Wait for the sequence to finish. Open Last send results to see what was sent and what needs attention."
      },
      {
        "title": "Retry carefully",
        "text": "Retry unsent skips messages marked successful. After an uncertain network error, check Discord first: the message may have arrived without a response."
      }
    ],
    "details": [
      {
        "title": "Rate limits",
        "text": "When Discord asks you to wait, Meowhook shows a countdown. Let it finish instead of repeatedly pressing Send."
      },
      {
        "title": "Reset stays in the draft",
        "text": "Reset clears the active draft’s message content after confirmation. It does not delete messages already sent to Discord."
      }
    ],
    "tip": "A draft can contain up to 10 messages. Sending creates separate Discord messages.",
    "related": [
      "editing",
      "troubleshooting",
      "webhooks"
    ]
  },
  {
    "id": "editing",
    "group": "Save & send",
    "title": "Change a message you already sent",
    "intro": "Fix a typo or replace a picture without posting the announcement all over again.",
    "steps": [
      {
        "title": "Find the message",
        "text": "Copy its Discord message link or ID. To copy IDs, enable Developer Mode in Discord’s Advanced settings."
      },
      {
        "title": "Load the original",
        "text": "Use the same webhook that sent it. Open Edit a sent message, paste the link or ID, then choose Load."
      },
      {
        "title": "Update or delete",
        "text": "Update changes the existing message. Delete removes it after confirmation. Send creates a new message instead."
      }
    ],
    "details": [
      {
        "title": "When loading fails",
        "text": "Check the original webhook, the ID, and whether the message still exists. You cannot edit someone else’s message through your webhook."
      },
      {
        "title": "Changing the format",
        "text": "A regular sent message can become V2: load it, turn on Advanced V2, review the blocks, and Update. This is one-way in Discord. A sent V2 message cannot return to the regular format."
      }
    ],
    "tip": "Load brings the original into your draft. Keep a backup of your current work if you need both versions.",
    "related": [
      "sending",
      "webhooks"
    ]
  },
  {
    "id": "advanced",
    "group": "Save & send",
    "title": "Small settings, useful shortcuts",
    "intro": "A few controls make repeat work easier. Use the ones that fit how you write.",
    "steps": [
      {
        "title": "Set delivery options",
        "text": "Advanced → Silent suppresses notification pings. In regular mode, Suppress Embeds hides embeds. Neither makes a message private."
      },
      {
        "title": "Use Undo and Redo",
        "text": "The toolbar steps through draft changes. Ctrl/Cmd+Z undoes and Ctrl/Cmd+Shift+Z redoes. A focused text editor can have its own history."
      },
      {
        "title": "Make the workspace yours",
        "text": "Theme changes Meowhook, not Discord. Shortcuts opens the keyboard guide. Feedback reports an issue; FAQ answers common questions."
      }
    ],
    "details": [
      {
        "title": "Quick actions",
        "text": "Alt+Shift+N adds a message; E adds an embed; D duplicates the active message; C returns to its content. Press ? outside text fields for the shortcut sheet."
      },
      {
        "title": "In the larger text editor",
        "text": "Ctrl/Cmd+B, I, U, and K apply bold, italic, underline, and links. Ctrl/Cmd+Enter applies edits. Escape cancels and restores the original."
      }
    ],
    "tip": "Keyboard focus stays visible, and reduced-motion preferences are respected.",
    "related": [
      "workspace",
      "text",
      "sending"
    ]
  },
  {
    "id": "troubleshooting",
    "group": "Save & send",
    "title": "When something won’t send",
    "intro": "Most warnings point to one unfinished piece. Start with the first warning and work from there.",
    "steps": [
      {
        "title": "Follow Show me where",
        "text": "A warning names the message, embed, or block that needs attention. Show me where jumps to its controls."
      },
      {
        "title": "Finish missing content",
        "text": "Fill both halves of a field, add visible content to an embed, finish button URLs, remove unused V2 blocks, or re-upload a missing file."
      },
      {
        "title": "Check the Discord response",
        "text": "A deleted webhook needs a new address. A rate limit needs time. A network error needs a check in the destination channel before retrying."
      }
    ],
    "details": [
      {
        "title": "Missing images",
        "text": "Check that the image URL is public and direct. Use URLs for V2. For regular uploads, check that the file is still available in this browser."
      },
      {
        "title": "Different rendering",
        "text": "Fonts, media crops, and inline field layouts can differ between the preview and Discord clients."
      },
      {
        "title": "Save warnings",
        "text": "Keep the tab open, export work if possible, and follow the warning. Clearing browser data before backing up can remove your drafts."
      }
    ],
    "tip": "The limits below are a quick reference. Shared message limits include every embed, not only the one open in the editor.",
    "related": [
      "images",
      "fields",
      "json"
    ]
  },
  ...botGuides,
];
export const limits = [["Drafts / messages in one draft","10 / 10"],["Regular message text","2,000 characters"],["Embeds in one message","10"],["Embed title / author name","256 characters each"],["Embed description","4,096 characters"],["Fields in one embed","25"],["Field name / value","256 / 1,024 characters"],["Embed footer","2,048 characters"],["All embed text in one message","6,000 characters total"],["Uploaded attachments in one message","10"],["All V2 text in one message","4,000 characters"],["Media items per gallery","1–10"],["V2 component budget","40, including nested components"],["Button label / URL","80 / 512 characters"]];
