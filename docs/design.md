# Product Design System

## 1. Design Philosophy

The application should feel like:

* Enterprise
* Premium
* Calm
* Extremely clear
* Fast
* Trustworthy
* Data-focused

Avoid the typical "AI chatbot" appearance.

The interface should communicate:

> This system knows exactly where its information comes from.

---

# 2. Main Navigation

Desktop sidebar:

```text
Logo

Home
Agents
Conversations

────────────

Knowledge
Analytics

────────────

Admin
Settings
```

Normal users should not see administrative navigation.

---

# 3. Home

Home should show:

```text
Good morning, [Name]

What would you like to know?

[ Ask anything...                         🎙 ]

Popular agents

[ HR Policy ] [ Finance ] [ Research ]
```

---

# 4. Agent Cards

Each agent card:

```text
Icon

Agent Name
Short description

[ Open Agent ]
```

Optional:

```text
Recommended
Most Used
New
```

---

# 5. Chat Interface

Structure:

```text
┌─────────────────────────────────────────┐
│ Agent Name                     Settings │
├─────────────────────────────────────────┤
│                                         │
│               Conversation              │
│                                         │
│ User message                            │
│                                         │
│ AI response                             │
│                                         │
│ Sources                                 │
│ ┌─────────────────────────────────────┐ │
│ │ document.pdf • Page 14             │ │
│ └─────────────────────────────────────┘ │
│                                         │
├─────────────────────────────────────────┤
│ Ask a question...             🎙  ↑     │
└─────────────────────────────────────────┘
```

---

# 6. AI Answer

Answers should use visual hierarchy.

Example:

```text
## Revenue increased by 18%

Revenue increased from ₹10.2 Cr to ₹12.0 Cr.

### Key numbers

₹12.0 Cr
Current revenue

+18%
Growth

₹1.8 Cr
Absolute increase

### Trend

[Chart]

### Source

Financial Results Q4.pdf
Page 8
```

---

# 7. Citations

Every factual answer should make citations visible.

Citation:

```text
[Financial Results Q4.pdf · Page 8]
```

Clicking citation opens:

```text
Document
Page
Relevant excerpt
```

Never expose documents the user is not authorized to access.

---

# 8. Tables

Tables should:

* have clear headers
* support sorting
* support horizontal scrolling
* format numbers correctly
* use Indian number formatting where appropriate
* avoid excessive borders

---

# 9. Charts

Charts should:

* have a title
* have axis labels
* include units
* include source
* support hover
* remain readable on mobile

---

# 10. Voice

Microphone button should be obvious but not dominant.

States:

```text
Idle
Listening
Processing
Complete
Error
```

Listening state should show:

```text
Listening...

████████████
```

---

# 11. Admin Dashboard

Dashboard layout:

```text
┌────────────┬────────────┬────────────┬────────────┐
│ Users      │ Queries    │ Documents  │ Agents     │
│ 1,240      │ 18,450     │ 8,421      │ 17         │
└────────────┴────────────┴────────────┴────────────┘

Query Volume
[Line chart]

Knowledge Health
[Status table]

Agent Usage
[Bar chart]

Recent Activity
[Table]
```

---

# 12. Knowledge Dashboard

```text
Knowledge Sources

SharePoint
 └── HR
      ├── Policies
      ├── Benefits
      └── Compliance
```

Each source:

```text
Status: Healthy

Documents: 1,204
Indexed: 1,201
Failed: 3

Last Sync:
Today, 12:42 PM

[Sync Now]
[Configure]
[View Files]
```

---

# 13. Agent Builder

Three-column interface:

```text
┌─────────────────┬─────────────────────┬─────────────────┐
│ Configuration   │ Preview             │ Test            │
│                 │                     │                 │
│ Name            │ Agent UI            │ Chat            │
│ Instructions    │                     │                 │
│ Knowledge       │                     │                 │
│ Output          │                     │                 │
│ Access          │                     │                 │
└─────────────────┴─────────────────────┴─────────────────┘
```

Natural-language creation:

```text
Describe what you want this agent to do...

[ Create Agent ]
```

Then show generated configuration.

Admin must approve.

---

# 14. Visual Language

Use:

* neutral background
* high contrast text
* restrained accent color
* subtle borders
* medium corner radius
* minimal shadows

Avoid:

* excessive gradients
* neon colors
* excessive glassmorphism
* huge AI icons
* distracting animations

---

# 15. Responsive Design

Desktop-first because this is enterprise software.

Must still support:

* tablet
* mobile

Charts should automatically resize.

---

# 16. Accessibility

Target:

```text
WCAG 2.2 AA
```

Requirements:

* keyboard navigation
* visible focus
* screen-reader labels
* sufficient contrast
* accessible charts
* accessible voice controls
