export interface TutorialSection {
  title: string;
  icon: string;
  content: string;
}

export const tutorialSections: TutorialSection[] = [
  { title: 'Send your first message', icon: '', content: `
    <h3>Send your first message</h3>
    <ol><li>In Discord, open your channel settings, choose <strong>Integrations → Webhooks</strong>, and create a webhook. Copy its URL.</li><li>Paste the URL into Meowhook. Keep it private: anyone with this link can post through your webhook.</li><li>Write a message or add an embed. The preview updates as you type.</li><li>Check the preview, then select <strong>Send</strong>.</li></ol>
    <p>You can write and preview without a webhook URL. You only need one when you send, load, update, or delete a message.</p>
  `},
  { title: 'Text and formatting', icon: '', content: `
    <h3>Text and formatting</h3>
    <p>Use Discord Markdown in your message or embed description:</p>
    <ul><li><code>**bold**</code>, <code>*italic*</code>, and <code>__underline__</code></li><li><code>~~strikethrough~~</code> and <code>||spoiler||</code></li><li>A line starting with <code>&gt; </code> for a quote</li><li><code>[label](https://example.com)</code> for a link</li></ul>
    <p>Open the larger text editor for formatting shortcuts, emoji, and timestamps. Discord timestamps use each reader’s timezone.</p>
    <p>For mentions, use <code>&lt;@user_id&gt;</code>, <code>&lt;@&amp;role_id&gt;</code>, or <code>&lt;#channel_id&gt;</code>. Custom emoji use <code>&lt;:name:id&gt;</code>. The preview cannot look up every server-specific name or emoji.</p>
  `},
  { title: 'Embeds and files', icon: '', content: `
    <h3>Embeds and files</h3>
    <p>Select <strong>Add embed</strong> for a title, description, color, fields, images, author, and footer. Fields need both a name and a value. Inline fields sit next to each other when there is room.</p>
    <p>Drag an embed by its handle to reorder it. You can also move it between messages in the same draft. Select an item in the preview to return to its editor.</p>
    <p>Add files under <strong>Files</strong>, or use the upload control beside an embed image. Uploaded embed images and message files share the limit of ten attachments per message. An image hosted at a web URL does not use an upload slot.</p>
    <p>Local uploads are stored in this browser and restored after a reload. Keep the original files when moving a draft to another device. Avatar images need a public image URL to be sent to Discord.</p>
  `},
  { title: 'Components and link buttons', icon: '', content: `
    <h3>Components and link buttons</h3>
    <p>For an ordinary message, open <strong>Link buttons</strong> and add a label and website URL. These buttons open the URL in Discord.</p>
    <p>Turn on <strong>Advanced V2 components</strong> to arrange text, thumbnail or link sections, media galleries, file cards, separators, containers, and link buttons. The order in the editor is the order sent to Discord.</p>
    <p>Components use a different Discord message format. Turning on V2 starts with editable blocks based on your regular text and embeds; your regular draft stays available if you switch back before sending. A sent regular message can be converted to V2, but Discord cannot switch a sent V2 message back. Use public URLs or upload images and videos in thumbnails and galleries. File blocks add downloads. Sections support up to three text blocks, and thumbnails, galleries, files, and containers have spoiler settings.</p>
    <p>Use Dashboard for role buttons, selection menus, private replies, and forms through the Meowhook bot. The ordinary webhook editor uses URL buttons for websites.</p>
  `},
  { title: 'Drafts, backups, and sharing', icon: '', content: `
    <h3>Drafts, backups, and sharing</h3>
    <p>Your changes are saved in this browser as you edit. Create a new draft to keep another message separate. Rename a draft with its pencil control.</p>
    <p>Under <strong>Browser backups</strong> in the sidebar, <strong>Save</strong> creates a named backup in this browser and <strong>Restore</strong> restores one. Use <strong>Export</strong> above the draft list to download your drafts and <strong>Import JSON</strong> to open it on another device.</p>
    <p><strong>Share</strong> creates a link to the active draft’s messages. It leaves out your webhook URL and local uploads. Anyone with the link can read the shared text and image URLs. Expiring links are stored by the share service; a permanent link stores the message data in the link itself.</p>
    <p>Shared drafts open under Temporary. Export them or include them in a backup before closing the browser session if you want to keep them. Clearing browser storage removes local drafts and backups.</p>
  `},
  { title: 'Update a sent message', icon: '', content: `
    <h3>Update a sent message</h3>
    <p>Open <strong>Edit a sent message</strong> below the message options. Paste the message ID or Discord message link, then select <strong>Load</strong>.</p>
    <p>Make your changes and select <strong>Update</strong>. This changes the existing Discord message. <strong>Send</strong> creates a new message instead.</p>
    <p>The webhook must be the same one that sent the original message. Delete removes the message from Discord and asks you to confirm first.</p>
    <p>To copy a message ID in Discord, enable Developer Mode under Advanced settings, then use the message’s context menu.</p>
  `},
  { title: 'JSON and templates', icon: '', content: `
    <h3>JSON and templates</h3>
    <p>Open <strong>JSON</strong> to view or edit the current message data. Use one object for a single message or an array for several messages. <strong>Apply to Editor</strong> replaces the messages in the active draft. Undo can restore your previous draft.</p>
    <p>The JSON editor supports message text, embeds, flags, thread name, URL buttons, and Components layouts. For bot interactions, save a message in Dashboard and attach your saved actions.</p>
    <p>Open <strong>Templates</strong> to start from an example. Replace names, dates, links, and other sample details before sending. You can also save your own templates in this browser.</p>
  `},
  { title: 'Limits and send errors', icon: '', content: `
    <h3>Limits and send errors</h3>
    <table class="tutorial-spec-table"><thead><tr><th>Item</th><th>Limit</th></tr></thead><tbody><tr><td>Messages in a draft</td><td>10</td></tr><tr><td>Message text</td><td>2,000 characters</td></tr><tr><td>Embeds per message</td><td>10</td></tr><tr><td>Embed title / author name</td><td>256 characters each</td></tr><tr><td>Embed description</td><td>4,096 characters</td></tr><tr><td>Fields per embed</td><td>25</td></tr><tr><td>Field name / value</td><td>256 / 1,024 characters</td></tr><tr><td>Footer</td><td>2,048 characters</td></tr><tr><td>All embed text in one message</td><td>6,000 characters</td></tr><tr><td>Uploaded attachments per message</td><td>10</td></tr></tbody></table>
    <p>If Send is unavailable, check the webhook URL, empty embeds, incomplete fields, and character counts. A message needs text, a file, or an embed with content.</p>
    <p>If Discord asks you to wait, Meowhook shows the remaining time. Check the destination channel before retrying a send after a network error, since the message may already have arrived.</p>
    <p>The preview is an approximation. Discord can render fonts, media, and narrow layouts differently. See <a href="https://docs.discord.com/developers/resources/message#embed-object-embed-limits" target="_blank" rel="noopener noreferrer">Discord’s embed limits</a> for the API rules.</p>
  `},
];
