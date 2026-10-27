import type { Embed, Field, Message } from './types';
import { createDefaultEmbed, createDefaultField, uid } from './utils';
import { createWelcomeDraft } from './welcomeDraft';

export interface BuiltinTemplate {
  name: string;
  emoji: string;
  category: string;
  description: string;
  /** Editor guidance, never included in the Discord message. */
  customize: string;
  messages: Message[];
}

export const templateCategories = ['Getting Started', 'Server Rules', 'Announcements', 'Changelogs', 'Embed Showcase'] as const;

const field = (name: string, value: string, inline = false): Field => ({ ...createDefaultField(), name, value, inline });
const embed = (color: number, content: Partial<Embed>): Embed => ({ ...createDefaultEmbed(), color, ...content });
const message = (username: string, embeds: Embed[], content = ''): Message => ({
  id: uid(), content, username, avatar_url: '', tts: false, flags: 0, embeds,
});
const author = (name: string) => ({ name, url: '', icon_url: '' });
const footer = (text: string) => ({ text, icon_url: '' });

// These are editable examples, not live event, membership, playback, or service data.
// Only the gallery needs artwork; other layouts use Discord's native text and fields.
const galleryImages = {
  dusk: 'https://images.unsplash.com/photo-1557682250-33bd709cbe85?w=1000&auto=format&fit=crop&q=80',
  form: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1000&auto=format&fit=crop&q=80',
};

export const builtinTemplates: BuiltinTemplate[] = [
  {
    name: 'Welcome example', emoji: '✦', category: 'Getting Started',
    description: 'A short, editable introduction to messages, embeds, and the live preview.',
    customize: 'Change the example text, adjust the embed, or open it as a new draft to try the editor safely.',
    messages: createWelcomeDraft().messages,
  },
  {
    name: 'Community Guidelines', emoji: '📜', category: 'Server Rules',
    description: 'An editorial handbook with numbered principles and a separate help note.',
    customize: 'Adapt the rules and moderation process to your community. Add your actual support channel.',
    messages: [message('The Commons', [
      embed(0x819783, {
        author: author('THE COMMONS / MEMBER HANDBOOK'),
        title: 'A good place to belong.',
        description: 'Different people. Shared space. A little care goes a long way.\n\nThese are the principles we ask everyone to follow.',
        fields: [
          field('01  /  People first', 'Disagree with ideas, not someone’s identity. Harassment, hate speech, threats, and unwanted personal contact have no place here.'),
          field('02  /  Make room for others', 'Keep conversations in the right channels. Skip repeated messages, unsolicited promotion, and unnecessary pings.'),
          field('03  /  Share thoughtfully', 'Keep shared content safe for work. Credit creators, mark spoilers, and never post someone’s private information without permission.'),
          field('04  /  Look after the space', 'Follow [Discord’s guidelines](https://discord.com/guidelines). If something feels wrong, contact a moderator privately instead of escalating it in chat.'),
        ],
        footer: footer('Read once. Practice every day.'),
      }),
      embed(0x59675b, {
        title: 'Need a hand?',
        description: 'Ask a moderator for help or clarification. Include a message link when reporting an issue so the team has the context it needs.',
      }),
    ])],
  },
  {
    name: 'Minimal Rules Card', emoji: '⚖️', category: 'Server Rules',
    description: 'Five house rules in one quiet, pocket-sized card.',
    customize: 'Replace or trim these five rules. This card does not grant roles or collect acceptance.',
    messages: [message('House Notes', [embed(0xa3a39c, {
      title: 'The short version',
      description: '**01**  Be kind. No harassment or hate.\n**02**  Keep it safe for work.\n**03**  No spam or unsolicited ads.\n**04**  Respect privacy. Ask before sharing.\n**05**  Use the right channel.',
      footer: footer('Good company starts with consideration.'),
    })])],
  },
  {
    name: 'Server Announcement', emoji: '📢', category: 'Announcements',
    description: 'A community bulletin that leads with the news and ends with the next step.',
    customize: 'Replace the sample channel changes and timing. Add a real channel mention if you want a clickable destination.',
    messages: [message('Community Desk', [embed(0xcaa46b, {
      author: author('COMMUNITY BULLETIN / 01'),
      title: 'A little less noise. More room to create.',
      description: 'We’re giving our creative spaces a new home. Work in progress, finished projects, and thoughtful feedback now have room of their own.',
      fields: [
        field('What’s changing', '**Studio** — share what you’re working on.\n**Showcase** — give finished work its moment.\n**Feedback** — ask for a second pair of eyes.'),
        field('When', 'From the next community reset.', true),
        field('Your next step', 'Bring one project to the Studio.', true),
        field('A note from the team', 'Existing conversations will stay available. If you’re unsure where something belongs, ask us—we’ll help you find a home for it.'),
      ],
      footer: footer('Made better by your suggestions. Keep them coming.'),
    })], '**From the community desk**\nA small update to how we make things together.')],
  },
  {
    name: 'Event Announcement', emoji: '🎉', category: 'Announcements',
    description: 'A warm event ticket with an at-a-glance schedule and a running order.',
    customize: 'Set the date, time zone, location, and RSVP instructions before sending. The event details are examples.',
    messages: [message('After Hours', [embed(0xd3906b, {
      author: author('AFTER HOURS / COMMUNITY SESSIONS'),
      title: 'Sketch & Sip',
      description: 'One prompt. A blank canvas. Good company.\n\nBring a drink and whatever you like to draw with. Beginners, doodlers, and quiet spectators are all welcome.',
      fields: [
        field('WHEN', '[Date] · 19:00 UTC', true),
        field('WHERE', 'The Studio voice channel', true),
        field('RUNNING ORDER', '`19:00`  Settle in & meet the group\n`19:10`  Reveal the drawing prompt\n`19:15`  Draw together, at your own pace\n`19:50`  Optional show & tell'),
        field('Save a seat', 'Reply in the event discussion if you’re joining. No special software or experience needed.'),
      ],
      footer: footer('60 minutes · Bring your curiosity'),
    })])],
  },
  {
    name: 'Partnership Post', emoji: '🤝', category: 'Announcements',
    description: 'A considered introduction with a partner spotlight and an invitation.',
    customize: 'Replace the fictional Paper Lantern community, verify its offerings, and add its real invite URL.',
    messages: [message('Good Neighbors', [
      embed(0xb28b76, {
        author: author('GOOD NEIGHBORS / COMMUNITY SPOTLIGHT'),
        title: 'Meet Paper Lantern',
        description: '> A small corner of the internet for people who make things.\n\nWriters, illustrators, and curious beginners sharing work, trading ideas, and cheering each other on.',
        fields: [
          field('Their space', 'Slow conversations.\nCreative experiments.\nRoom to start small.', true),
          field('Why we connect', 'A shared love of craft.\nThoughtful feedback.\nPeople over numbers.', true),
        ],
      }),
      embed(0x827c65, {
        title: 'Leave a little hello',
        description: 'Visit **Paper Lantern** and tell them what you’re making.\n\n**Community invite:** [Add your partner’s invite URL]',
        footer: footer('Two communities. More possibilities.'),
      }),
    ])],
  },
  {
    name: 'Version Update', emoji: '⚙️', category: 'Changelogs',
    description: 'Product release notes with a feature spotlight and a separate compatibility note.',
    customize: 'Replace the fictional Fieldnotes release, version, changes, and compatibility details with verified release information.',
    messages: [message('Fieldnotes Releases', [
      embed(0x749caf, {
        author: author('FIELDNOTES / RELEASE 2.4'),
        title: 'Find your way back.',
        description: 'This release makes a growing workspace easier to navigate. Less searching. More picking up where you left off.',
        fields: [
          field('NEW / Pinned collections', 'Keep frequently used collections at the top of your workspace. Arrange them in the order that makes sense to you.'),
          field('IMPROVED', '• Search remembers your last filter.\n• Long titles wrap cleanly on mobile.\n• Keyboard navigation follows the visible order.'),
          field('FIXED', '• Restored missing thumbnails after refresh.\n• Removed duplicate save notifications.\n• Corrected dates around midnight.'),
        ],
      }),
      embed(0x7d8790, {
        title: 'Before you update',
        description: '**No migration required.** Existing collections stay as they are.\n\n**Known limitation:** Offline search covers recently opened collections only.',
        footer: footer('v2.4.0 · Release notes'),
      }),
    ])],
  },
  {
    name: 'Quick Changelog', emoji: '📝', category: 'Changelogs',
    description: 'A terse terminal-style patch log for the updates that need no fanfare.',
    customize: 'Update the version and patch entries. The diff block is static release text.',
    messages: [message('Patch Log', [embed(0x88a68e, {
      title: '2.4.1 / Hotfix',
      description: 'Small patch. Smoother edges.\n\n```diff\n+ Restore the last selected collection\n+ Keep search focus after clearing a filter\n- Remove duplicate save notifications\n```\n**Action required:** Refresh to pick up the update.',
      footer: footer('Maintenance release · No data migration'),
    })])],
  },
  {
    name: 'Roadmap Preview', emoji: '🗺️', category: 'Changelogs',
    description: 'Three separate stages: what’s moving now, what’s next, and what’s still an idea.',
    customize: 'Replace the sample initiatives and progress. Stages express priority, not promised delivery dates.',
    messages: [message('Workbench', [
      embed(0x92a784, {
        author: author('01 / NOW'), title: 'Make the first five minutes better',
        description: '**Simpler onboarding**\nA shorter setup, clearer examples, and a useful first project.',
        fields: [field('In motion', 'Prototype complete → testing with new members')],
      }),
      embed(0xbca06d, {
        author: author('02 / NEXT'), title: 'Bring everyone’s plans into view',
        description: '**A shared community calendar**\nOne place for workshops, meetups, and recurring sessions.',
        fields: [field('Up next', 'Choose the smallest useful version with the community')],
      }),
      embed(0x9a8da9, {
        author: author('03 / EXPLORING'), title: 'Give good ideas a place to grow',
        description: '**A member-led project board**\nFind collaborators, share small proposals, and build together.',
        footer: footer('Direction, not deadlines. Plans may change as we learn.'),
      }),
    ], '**On the workbench**\nA look at what we’re building—and why.')],
  },
  {
    name: 'Aesthetic Profile Card', emoji: '🌸', category: 'Embed Showcase',
    description: 'A personal calling card with a soft editorial voice and a two-column fact file.',
    customize: 'Replace the fictional name, pronouns, interests, and contact preferences with your own.',
    messages: [message('Sora', [embed(0xc79cab, {
      author: author('THE PEOPLE HERE / 001'),
      title: 'Sora, usually sketching.',
      description: '*Collecting small moments and turning them into little worlds.*\n\nIllustrator, window-seat enthusiast, and keeper of too many unfinished sketchbooks.',
      fields: [
        field('A LITTLE ABOUT ME', 'she / they\nBased in Kyoto · JST\nWatercolor & digital illustration', true),
        field('CURRENTLY', 'Drawing neighborhood cafés\nReading a little science fiction\nLearning to slow down', true),
        field('Say hello about…', 'Your latest creative project, a book you couldn’t put down, or the best thing you ate this week.'),
      ],
      footer: footer('A quiet hello is still a hello. Ask before sending DMs.'),
    })])],
  },
  {
    name: 'Neon Cyberpunk', emoji: '🌃', category: 'Embed Showcase',
    description: 'A fictional intercepted transmission with mission coordinates and a redacted clue.',
    customize: 'Adapt the fictional dispatch to your game or story. The terminal readout is decorative text.',
    messages: [message('RELAY / 07', [embed(0x64c8c3, {
      author: author('PIRATE FREQUENCY · 108.7'),
      title: 'Someone left the signal on.',
      description: '```text\nRELAY_07 > packet recovered\nSOURCE   > unknown\nPAYLOAD  > one last favor\n```\nThe city went quiet at 03:17. Every screen went dark except yours.\n\n> “If you can read this, take the eastbound train. Don’t wait for the lights.”',
      fields: [
        field('RENDEZVOUS', '`PLATFORM 09`', true),
        field('WINDOW', '`BEFORE DAWN`', true),
        field('THE PART THEY ERASED', '||The sender is using your access key.||'),
      ],
      footer: footer('FICTIONAL TRANSMISSION / END OF PACKET'),
    })], '`[ UNLISTED FREQUENCY / INCOMING ]`')],
  },
  {
    name: 'Multi-Embed Gallery', emoji: '🖼️', category: 'Embed Showcase',
    description: 'A curated diptych: two full-width artworks, individual captions, and a curator’s note.',
    customize: 'Replace the sample images, titles, and captions with your work. Credit the artists and check permission to share.',
    messages: [message('Small Gallery', [
      embed(0x9c82ae, {
        author: author('STUDIES IN COLOR / 01'), title: 'Between day and night',
        description: 'A study in atmosphere: a quiet gradient with no hard edge to tell you where one color ends.',
        image: { url: galleryImages.dusk }, footer: footer('01 of 02 · Color study · Sample image via Unsplash'),
      }),
      embed(0x8c9bbb, {
        author: author('STUDIES IN COLOR / 02'), title: 'Soft geometry',
        description: 'Form takes the lead. Light folds over a surface, turning a simple shape into something almost tactile.',
        image: { url: galleryImages.form }, footer: footer('02 of 02 · Form study · Sample image via Unsplash'),
      }),
      embed(0x9a968e, {
        description: '**From the curator**\nOne study dissolves its edges; the other finds them. Together, they explore how much a little light can change.',
      }),
    ], '**Small Gallery — Volume 01**\nTwo studies. One conversation about color and form.')],
  },
  {
    name: 'Lofi Chill Card', emoji: '🎧', category: 'Embed Showcase',
    description: 'A late-night listening sleeve with a short, fictional three-track selection.',
    customize: 'Replace the fictional tracks with your playlist and add a listening link. This is a static card, not a music player.',
    messages: [message('Window Seat Radio', [embed(0xa293b5, {
      author: author('WINDOW SEAT RADIO / SESSION 03'),
      title: 'Rain on the last train home',
      description: '*For half-finished thoughts and the long way back.*\n\nSoft keys, brushed drums, and enough space between the notes to breathe.',
      fields: [
        field('SIDE A / THE SELECTION', '`01`  Platform Lights — 3:12\n`02`  A Window Left Open — 2:48\n`03`  Home Before Morning — 4:06'),
        field('THE SETTING', 'Low lights · Rain outside', true),
        field('THE PACE', 'Unhurried · No skips needed', true),
      ],
      footer: footer('Imaginary tracklist · Make this session your own'),
    })])],
  },
  {
    name: 'Status Dashboard', emoji: '📊', category: 'Embed Showcase',
    description: 'A readable incident bulletin with service states, impact, and the next update.',
    customize: 'Replace all sample service states and times with verified information. This report does not monitor or refresh automatically.',
    messages: [message('Service Desk', [embed(0xc4a064, {
      author: author('SERVICE HEALTH / SAMPLE REPORT'),
      title: 'Investigating delayed notifications',
      description: '**Some notifications are arriving later than usual.**\nYou can still sign in and use your workspace. There is no need to resend your messages.',
      fields: [
        field('SERVICE CHECK', '**Normal** · Sign-in\n**Normal** · Workspace & files\n**Delayed** · Notifications'),
        field('14:10 UTC / Identified', 'The notification queue is processing more slowly than expected. The team is investigating the cause.'),
        field('NEXT UPDATE', '14:40 UTC', true),
        field('WHAT YOU CAN DO', 'Continue using the workspace.', true),
      ],
      footer: footer('Example incident · Manually maintained bulletin'),
    })])],
  },
  {
    name: 'Rich Welcome Card', emoji: '👋', category: 'Embed Showcase',
    description: 'A friendly two-part welcome: three simple first steps and an icebreaker.',
    customize: 'Use your server’s name and replace channel names with real channel mentions. No member ping is included by default.',
    messages: [message('The Front Porch', [
      embed(0x79aaa1, {
        title: 'Come in. Find your people.',
        description: 'Welcome to **The Front Porch**, a place for curious people and good conversations. No perfect introduction required.',
        fields: [
          field('01 / Get your bearings', 'Start with the **rules** channel. It’s a short read about how we look after one another.'),
          field('02 / Make yourself at home', 'Browse the conversations and find something you enjoy. Reading along counts as joining in.'),
          field('03 / Say a little hello', 'Visit **introductions** whenever you’re ready. A name and an interest are plenty.'),
        ],
      }),
      embed(0xb9a582, {
        title: 'An easy place to start',
        description: '**What’s something you could talk about for hours?**\n\nA hobby, a favorite game, an oddly specific interest—we’d love to hear it.',
        footer: footer('Settle in at your own pace. We’re glad you’re here.'),
      }),
    ], 'Hey there, welcome in. 👋')],
  },
];
