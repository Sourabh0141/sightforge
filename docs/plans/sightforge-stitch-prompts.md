# SightForge — Google Stitch Design Prompts

Sixteen screens, one prompt each, derived from the five implementation plans. Every prompt respects decisions already made: the seven tasks and which four support tracking, the media limits, the job states, the accessibility mechanisms, and the failure vocabulary. None introduces a feature the plans do not contain.

---

## How to use this document

**Stitch generates one screen per prompt.** Sixteen independent prompts would give you sixteen screens that look like they came from different products. The fix is Section 1 — a design-system block you paste at the top of _every_ prompt, before the screen-specific part. It is the single most important thing in this document. Do not skip it to save typing.

**Each prompt has four parts**, and you paste all four together:

1. The design system block (Section 1, identical every time)
2. The screen prompt (Sections 3–18)
3. The responsive block that comes with that screen
4. The "do not add" list that comes with that screen

**The "do not add" list matters more than it looks.** Stitch will confidently invent social login, pricing tiers, team switchers, notification bells, and onboarding carousels — none of which exist in this product. Every prompt names what to leave out.

**Suggested order.** Build the landing page first and iterate until the visual language is right, because every later screen inherits it. Then the app shell, then the dashboard. Once those three agree with each other, the rest go quickly.

**Expect three or four rounds per screen.** The first generation gets structure roughly right and details wrong. Iterate in Stitch's chat with small, specific asks — "make the sidebar narrower and move the task filter into it" — rather than re-pasting a modified prompt.

---

## 1. The design system block

Paste this verbatim at the top of every prompt.

> **Design system — apply to this screen exactly.**
>
> This is SightForge, a computer vision platform where people upload an image or a short video and get back visual analysis — object detection, segmentation, pose estimation, depth maps. The audience is software engineers. The interface should feel like a precision instrument: confident, dense with real information, and quiet. Think of the polish level of Linear, Vercel's dashboard, or Raycast — not a marketing site, not a consumer app.
>
> **Dark theme only.** There is no light mode.
>
> Colours: page background `#0A0C10`, raised surfaces `#12151C`, cards and panels `#1A1F29`, borders and dividers `#252B37`. Primary text `#E8EAED`, secondary text `#9AA3B2`, muted text `#6B7280`. The accent is electric cyan `#22D3EE`, used sparingly — for the primary action on a screen, active states, and focus rings, never as a large fill. A violet `#A78BFA` appears only in gradients paired with the cyan. Success `#34D399`, warning `#FBBF24`, error `#F87171`.
>
> Typography: a geometric sans (Inter or similar) for all interface text, and a monospace face (JetBrains Mono or similar) for anything technical — job identifiers, timestamps, confidence values, coordinates, durations, file sizes, and JSON. That split is deliberate and load-bearing: it is what makes the product read as an instrument rather than a website.
>
> Surfaces are flat with 1px borders, not drop shadows. Corner radius 8px on cards and inputs, 6px on buttons, 4px on small chips and badges. Generous internal padding — 24px inside cards on desktop, 16px on mobile. Never use pure black or pure white for interface surfaces or text.
>
> Every interactive element has a visible focus ring: a 2px cyan outline with a 2px offset. This is not optional — the product must be fully keyboard operable.
>
> Layout uses a 12-column grid with a 1280px maximum content width, centred, with 32px gutters on desktop.
>
> Breakpoints: desktop 1280px and above, tablet 768–1279px, mobile below 768px.

---

## 2. Screen inventory

| # | Screen | Access | Section |
| --- | --- | --- | --- |
| 1 | Landing page | Public | 3 |
| 2 | Demo gallery — index | Public | 4 |
| 3 | Demo gallery — task detail | Public | 5 |
| 4 | Sign up | Public | 6 |
| 5 | Sign in | Public | 7 |
| 6 | Application shell | Authenticated | 8 |
| 7 | Dashboard / job history | Authenticated | 9 |
| 8 | New job | Authenticated | 10 |
| 9 | Job in progress | Authenticated | 11 |
| 10 | Results — region tasks | Authenticated | 12 |
| 11 | Results — dense tasks | Authenticated | 13 |
| 12 | Results — classification | Authenticated | 14 |
| 13 | Raw result inspector | Authenticated | 15 |
| 14 | Account settings | Authenticated | 16 |
| 15 | Service capacity state | Public | 17 |
| 16 | Empty, error, and loading states | Both | 18 |

Three results screens rather than one, because the seven tasks produce three genuinely different shapes: four tasks draw regions over the media, two draw a dense pixel overlay, and one has no image overlay at all. A single "results" design would fit one of the three and fight the other two.

---

## 3. Landing page

> **[paste the design system block first]**
>
> Design the public landing page for SightForge. This is the first thing an engineer or hiring manager sees, and its job is to make them click through to the live demo within about ten seconds.
>
> **Hero section.** A short, confident headline — "Seven computer vision tasks. One upload." — with a single supporting sentence explaining that you upload an image or a short clip, pick a task, and get structured results you can inspect. Two buttons: a primary cyan "See it working" that leads to the demo gallery, and a secondary outlined "Create an account". The primary button is the more prominent of the two, because the gallery needs no signup.
>
> To the right of the text on desktop, show a real-looking product visual: a dark photograph of a street scene with detection overlays drawn on it — thin white rectangles with a subtle dark outline around several people and vehicles, each with a small opaque label chip reading a class name and a confidence value in monospace, like `person 0.94`. This must look like actual output, not a decorative illustration.
>
> **Task strip.** Below the hero, a horizontal row of seven small cards naming the tasks: Object Detection, Instance Segmentation, Semantic Segmentation, Classification, Pose Estimation, Oriented Bounding Box, Depth Estimation. Each card has a tiny abstract visual hinting at that output shape — rectangles, blobs, a dense colour field, a ranked list, a stick-figure skeleton, rotated rectangles, a gradient depth ramp — plus the task name and a four-or-five word description. On desktop show all seven in one scrollable row; on tablet two rows; on mobile a horizontally scrollable strip with the first card partly cut off at the right edge to signal scrollability.
>
> **How it works.** Three numbered steps with short labels: "Upload an image or a clip under 30 seconds", "Choose a task and a model size", "Watch it run and read the results". Keep this compact — three columns on desktop, stacked on mobile. No illustrations, just clean numbered blocks.
>
> **Technical credibility band.** A quieter section for the engineering audience, showing four or five short facts as small stat blocks with monospace numbers: seven tasks, results in structured JSON, runs on serverless GPU, open source under AGPL-3.0. Understated, not a marketing brag bar.
>
> **Footer.** Product name, a link to the source repository, and a link to the demo gallery. Keep it to one row on desktop.
>
> **Navigation.** A slim sticky top bar: wordmark on the left, and on the right "Demo", "Source", "Sign in", and a cyan "Get started" button. The bar starts transparent over the hero and gains a background and a bottom border once the page scrolls.
>
> **Responsive.** Desktop: hero is a two-column split, text left and visual right. Tablet: hero stacks, visual below text at full width, navigation keeps all links. Mobile: hero stacks with the visual first at reduced height, navigation collapses to a wordmark and a hamburger opening a full-screen menu, the task strip scrolls horizontally, and the how-it-works steps stack vertically.
>
> **Do not add:** pricing, testimonials, customer logos, a newsletter signup, a chatbot, social media icons, an onboarding video, or a feature comparison table. There are no paid tiers and no customers.

---

## 4. Demo gallery — index

> **[paste the design system block first]**
>
> Design the public demo gallery index for SightForge. This page shows real, pre-computed analysis results for all seven computer vision tasks so a visitor can see the product working without creating an account. No sign-in, no waiting, no loading spinner — the results are already there.
>
> **Header.** A page title "See it working" and one sentence: "Real results from every task, pre-computed so you can look immediately. Run your own after signing up." Below that, a small note that these are stored examples rather than live analysis — be honest about it rather than implying live processing.
>
> **Grid.** Eight cards — the seven tasks plus one extra card for object tracking across video frames. Each card shows a thumbnail of the actual analysed image with its overlay already drawn on it, so the grid itself is a wall of real output. Over or beneath the thumbnail: the task name, a one-line description of what the task produces, and a small monospace metadata line showing something concrete like `14 objects · 640×640 · 41ms`. Cards have a 1px border that brightens to cyan on hover, and the thumbnail lifts very slightly.
>
> The tracking card is visually distinguishable — mark it with a small "video" badge, since it is the only one showing a clip rather than a still.
>
> **Responsive.** Desktop: four cards per row. Tablet: two per row. Mobile: one per row, full width, with the thumbnail keeping its aspect ratio. Cards should never become so small that the overlay detail inside the thumbnail is unreadable — on mobile the thumbnail can be taller relative to the card.
>
> **Footer.** A quiet band at the bottom: "Ready to run your own?" with a cyan "Create an account" button and a secondary "Read the source" link.
>
> **Do not add:** filtering, sorting, search, categories, pagination, a favourites feature, or user-generated content. There are exactly eight fixed examples.

---

## 5. Demo gallery — task detail

> **[paste the design system block first]**
>
> Design the detail page for a single demo gallery example in SightForge. Design it for the object detection example specifically; the same layout will be reused for the other tasks. This page is public — no sign-in required.
>
> **Layout.** A two-column split on desktop. The left and larger column holds the visualization: the analysed photograph with detection overlays drawn on top of it. Overlays are thin white rectangles, each with a dark outline beneath the white so the edge stays visible over any part of the photo, and each carries a small opaque dark label chip in the corner showing the class name and confidence in monospace — `person 0.94`. Above the image, a compact toolbar with zoom controls and a toggle to show or hide the overlay.
>
> The right column is a details panel, roughly 380px wide, holding three stacked blocks:
>
> - **What this is** — the task name, and two or three sentences in plain language explaining what object detection does and how to read the picture. Written for someone who does not know the difference between detection and segmentation.
> - **Detections** — a scrollable table listing every detected object with columns for class, confidence, and position. Monospace for the numbers. Rows highlight on hover, and hovering a row highlights the corresponding box in the image.
> - **Run details** — a small definition list in monospace: model, image size, inference time, result format version.
>
> **Below both columns**, a collapsed section labelled "Raw result" that expands to show the underlying JSON with syntax highlighting and collapsible nodes. Collapsed by default.
>
> **Navigation.** A back link to the gallery at the top, and previous/next arrows to move between the eight examples without returning to the index.
>
> **Responsive.** Desktop: two columns, image left, details right, both visible at once. Tablet: image full width at the top, details panel below it, table still full width. Mobile: image full width first, then the explanation, then the detections table — and on mobile the table drops the position column and shows only class and confidence, since three numeric columns will not fit. The raw JSON section stays collapsed on mobile and scrolls horizontally when opened.
>
> **Do not add:** comments, sharing buttons, download buttons, a rating widget, or any control that implies the visitor can re-run or modify this example. It is a fixed stored result.

---

## 6. Sign up

> **[paste the design system block first]**
>
> Design the account creation screen for SightForge.
>
> **Layout.** A two-column split on desktop. The left column is a centred form, maximum 420px wide. The right column is a quieter panel with a dark gradient background carrying a subtle cyan-to-violet tint, holding a short reassurance: the product name, one line about what the account gets you, and three small bullet points — all seven tasks, results kept for 30 days, free to use.
>
> **The form** has, in order: a heading "Create your account", a subheading offering a link to sign in instead, an email field, a password field with a show/hide toggle, a password strength indicator, a bot-protection widget placeholder (a bordered rectangle roughly 300×65px labelled as a verification challenge), and a full-width cyan submit button reading "Create account".
>
> **Important detail specific to this product.** When the form is submitted, the password is processed in the browser before anything is sent — this takes one to four seconds and is not instant. Design an explicit state for it: the submit button becomes disabled, its label changes to "Securing your password…", and a slim indeterminate progress bar appears directly beneath it with a small line of muted text reading "This happens in your browser — your password is never sent." Do not use a plain spinner. This wait is a feature, and the interface should say so.
>
> Below the form, a line of muted text noting that the password is never transmitted, with a small link reading "How this works".
>
> **Error handling.** Show inline field-level errors beneath each field in the error colour, and design a form-level error banner above the heading for failures that are not field-specific.
>
> **Responsive.** Desktop: two columns, form left, reassurance panel right. Tablet: form centred, reassurance panel collapses to a single line above the heading. Mobile: form only at full width with 16px page margins, reassurance panel hidden entirely, and the bot-protection widget scales to fit without horizontal scrolling.
>
> **Do not add:** social or single-sign-on buttons, a "remember me" checkbox, a phone number field, a name field, terms-and-conditions checkboxes, or a multi-step wizard. Email and password only, one step.

---

## 7. Sign in

> **[paste the design system block first]**
>
> Design the sign-in screen for SightForge. It should be visually consistent with the account creation screen — same two-column structure, same form width — but noticeably simpler.
>
> **The form** contains: a heading "Sign in", a subheading linking to account creation, an email field, a password field with a show/hide toggle, a bot-protection widget placeholder, and a full-width cyan "Sign in" button.
>
> **Same in-browser password processing state as the sign-up screen** — disabled button, label changing to "Securing your password…", slim progress bar, and the explanatory line. Reuse it exactly; consistency between the two screens matters.
>
> **Error handling.** A single form-level error banner above the heading. The message is deliberately generic — "Sign in failed. Check your email and password." — and never says whether the email exists. Design one error style, not two, because the interface must not reveal which half was wrong.
>
> **Responsive.** Identical structure to sign-up: two columns on desktop, form-only centred on tablet, full-width form with no side panel on mobile.
>
> **Do not add:** social login, a "keep me signed in" toggle, a forgotten-password link, magic-link sign-in, or two-factor prompts. None of these exist in this product.

---

## 8. Application shell

> **[paste the design system block first]**
>
> Design the persistent navigation shell that wraps every signed-in screen of SightForge. This is not a page — it is the frame that surrounds the dashboard, the new-job screen, and the results screens. Show it wrapping a placeholder content area so the proportions are visible.
>
> **Desktop.** A fixed left sidebar, 240px wide, with the page background one step darker than the content area beside it. Top of the sidebar: the wordmark. Below it, a prominent cyan "New job" button, full sidebar width. Below that, a navigation list with an icon and a label per item: Jobs, New job, Gallery, Settings. The active item has a cyan left border, a slightly raised background, and brighter text.
>
> At the bottom of the sidebar, pinned: a compact usage block showing today's job count against the daily allowance as a small progress bar with monospace numbers like `7 / 50 jobs today`, and beneath it a user block showing the truncated email with a menu for sign-out and account settings.
>
> The content area to the right has a slim top bar carrying the current page title on the left and contextual actions on the right.
>
> **Tablet.** The sidebar collapses to a 72px icon rail — icons only, no labels, tooltips on hover. The "New job" button becomes an icon button. The usage block collapses to a small ring indicator.
>
> **Mobile.** The sidebar disappears entirely. A bottom tab bar takes its place with four items — Jobs, New, Gallery, Settings — where "New" is visually emphasised as the primary action with a cyan filled circle. A slim top bar keeps the page title and a back arrow where relevant. The usage block moves into the Settings screen rather than being always visible.
>
> **Footer.** Present in the content area on desktop and tablet, a single quiet line with a link to the source repository and the licence name. On mobile it appears only at the bottom of scrollable pages, not fixed.
>
> **Do not add:** a notification bell, a global search bar, a workspace or team switcher, a help widget, a theme toggle, or breadcrumbs. This is a single-user product with four destinations and no light mode.

---

## 9. Dashboard / job history

> **[paste the design system block first]**
>
> Design the main signed-in dashboard for SightForge — the list of every analysis job the user has run. Show it inside the application shell described previously.
>
> **Top of page.** The heading "Your jobs" with the total count beside it in muted text. On the right, a cyan "New job" button. Below the heading, a compact filter row: status chips reading All, Running, Completed, Failed, and a task-type dropdown. Filters are chips rather than a form — one click, no apply button.
>
> **The list.** Each job is a row, not a card. A row contains, left to right: a small thumbnail of the source media, roughly 48×48px, with a tiny badge marking video versus image; the task name in primary text with the model size beneath it in muted monospace; a status pill; a relative timestamp like "12 minutes ago"; and a chevron.
>
> **The status pill is the most important element on this screen.** Design all seven states distinctly, and never by colour alone — each combines a colour, a small shape or icon, and a text label:
>
> - Created — muted grey, hollow circle
> - Uploading — grey with a small progress arc
> - Queued — muted blue, dotted circle
> - Processing — cyan, with a slowly rotating arc, and for video jobs the pill expands to show `142 / 300 frames`
> - Completed — green, filled check
> - Failed — red, filled cross, with the failure reason shown beside it in small muted text, such as "file too large" or "unsupported codec"
> - Cancelled — muted grey, dash
>
> A running job's row is visually distinct — a faint cyan left border — so it is findable in a long list at a glance.
>
> **Row actions.** On hover, reveal a small action group on the right: "View" for completed jobs, "Cancel" for anything still running, and a delete icon. On mobile these live behind a three-dot menu instead of on hover.
>
> **Empty state.** When there are no jobs, replace the list with a centred block: a simple line illustration, the heading "No jobs yet", one line of explanatory text, a cyan "Run your first job" button, and a secondary link reading "Or look at the demo gallery".
>
> **Responsive.** Desktop: full-width rows, all columns visible, actions on hover. Tablet: drop the model-size subtitle and shorten the timestamp. Mobile: each job becomes a two-line stacked card — thumbnail and task name on the first line, status pill and timestamp on the second — with the actions behind a three-dot menu. Filter chips scroll horizontally on mobile.
>
> **Do not add:** bulk selection, multi-select checkboxes, an export button, sharing, folders, tags, or a calendar view. Jobs are a flat chronological list.

---

## 10. New job

> **[paste the design system block first]**
>
> Design the screen where a user starts a new analysis in SightForge. Show it inside the application shell. This screen does two things in one view: take a file, and configure how it will be analysed.
>
> **Desktop layout.** Two columns. The left column, roughly 60% width, is the media area. The right column, roughly 40%, is the configuration panel. Both are visible simultaneously — this is not a wizard.
>
> **Media area, empty.** A large drop zone with a dashed 2px border that brightens to cyan when a file is dragged over it, and a very subtle cyan tint fills the zone during the drag. Inside: an upload icon, the text "Drop an image or video here", a secondary line "or click to browse", and beneath that in small muted monospace the actual limits — `JPEG, PNG, WebP up to 10 MB · MP4 up to 50 MB and 30 seconds`.
>
> **Media area, file selected.** The drop zone is replaced by a preview of the file — the image itself, or the first frame of the video with a duration badge. Beneath it, a monospace metadata line showing filename, dimensions, file size, and for video the duration. A small "Replace" text button sits in the corner.
>
> **Media area, uploading.** The preview stays visible at reduced opacity with a determinate progress bar across its bottom edge and a percentage in monospace.
>
> **Configuration panel.** A card containing these controls in order:
>
> 1. **Task** — a 2-column grid of seven selectable tiles, one per task, each with a small shape icon and the task name. The selected tile has a cyan border and a faint cyan background tint. This is the primary choice on the screen and should feel like it.
> 2. **Model size** — a two-option segmented control: "Nano — fastest" and "Small — more accurate". Beneath it, a muted line noting the rough speed difference.
> 3. **Video options** — an entire section that only appears when the selected file is a video. It contains a two-option choice between "Per-frame" and "Tracking", with one line of explanation each: per-frame analyses frames independently, tracking follows the same object across frames. Below that, a frame-rate slider from 2 to 10 frames per second, shown only when per-frame is selected, with the value in monospace.
> 4. **Confidence threshold** — a slider from 0 to 1, default 0.25, with the current value shown in monospace beside the label.
>
> **A critical conditional rule.** Tracking is only available for four of the seven tasks — object detection, instance segmentation, pose estimation, and oriented bounding box. When the user has selected classification, semantic segmentation, or depth estimation, the tracking option must appear **visibly disabled with a short explanation beside it** — "Tracking needs objects to follow. Not available for this task." — rather than being hidden. Hiding it would make the interface look inconsistent between tasks; disabling it with a reason teaches the user something.
>
> **Submit.** A full-width cyan button at the bottom of the configuration panel reading "Run analysis". It is disabled until a file is present, and shows a brief loading state on click.
>
> **Responsive.** Desktop: side-by-side columns. Tablet: media area on top at full width, configuration panel below it, task tiles in a 3-column grid. Mobile: fully stacked — drop zone at reduced height, then configuration, with the task tiles becoming a 2-column grid, and the submit button fixed to the bottom of the viewport so it is always reachable without scrolling past the configuration.
>
> **Do not add:** batch or multiple-file upload, a URL-import field, a camera capture option, cropping or editing tools, presets, or saved configurations. One file, one configuration, one job.

---

## 11. Job in progress

> **[paste the design system block first]**
>
> Design the screen a user watches while their analysis runs in SightForge. Show it inside the application shell. This screen exists because the work takes time — often ten to twenty seconds — and the interface has to make that wait feel intentional rather than broken.
>
> **Centre of the screen**, in a single card up to 640px wide: a preview thumbnail of the submitted media at the top, then the job's current stage, then progress, then details.
>
> **The stage indicator** is a horizontal four-step tracker: Uploading → Queued → Processing → Complete. Completed steps show a small filled check in green, the current step is cyan with a subtle pulsing dot, and future steps are muted and hollow. Steps are connected by a thin line that fills with cyan as progress advances.
>
> **Beneath it, the honest wait.** A line of text that changes by stage. During Queued: "Starting up the analysis container. This usually takes 8 to 15 seconds on a cold start." During Processing for an image: "Analysing." During Processing for a video: a determinate progress bar with monospace text reading `142 / 300 frames`. Include a small info icon beside the cold-start message that reveals a short explanation of why the first run is slower — the compute scales to zero when idle, which is what keeps the service free.
>
> This transparency is a deliberate product decision. Do not replace it with a generic spinner or a fake percentage.
>
> **Details block.** A small monospace definition list: job identifier, task, model size, mode, submitted-at timestamp.
>
> **Actions.** A "Cancel job" button in muted styling below the card, available at every stage before completion. When clicked it asks for confirmation inline rather than in a modal.
>
> **Failure state.** Design this variant too: the stage tracker shows the failed step in red, and the card body is replaced by a clear failure block — a heading naming what went wrong in plain language, one sentence of explanation, and where relevant a suggested action. Cover these reasons: file too large, unsupported format, video too long, unsupported video codec, the file changed after upload, the job took too long, and the analysis itself failed. Each gets a human sentence, never an error code alone.
>
> **Responsive.** Desktop and tablet: centred card, horizontal stage tracker. Mobile: card fills the width with 16px margins, and the stage tracker becomes vertical — four rows with the connecting line running down the left side — because four horizontal labels do not fit legibly on a narrow screen.
>
> **Do not add:** an estimated-time-remaining countdown, a queue position, a live log stream, a cancel-and-retry combination, or background notification prompts. The system reports stage and frame progress, nothing finer.

---

## 12. Results — region tasks

> **[paste the design system block first]**
>
> Design the results viewer for SightForge for tasks that draw regions over the media — object detection, instance segmentation, pose estimation, and oriented bounding boxes. Design it for object detection on a single image; the same layout serves the other three. Show it inside the application shell. This is the most important screen in the product.
>
> **Desktop layout.** Two columns. The left column, roughly 65%, is the visualization. The right column, roughly 35%, is a detail panel. Both scroll independently.
>
> **The visualization.** The source image fills the column, with detection overlays drawn on top. Get the overlay treatment exactly right, because it is specified by an accessibility requirement:
>
> - Each region is a thin **white** stroke with a **black** outline immediately beneath it, so that one of the two edges is always visible whatever the photo underneath is doing. Do not use coloured strokes.
> - Each region carries a small **opaque dark label chip** at its corner containing the class name and confidence in monospace — `person 0.94`. The chip is opaque so the text contrast is measured against the chip, not the photo.
> - The currently selected region is emphasised with a thicker stroke and a cyan accent, and every other region dims slightly.
>
> Above the image, a toolbar: zoom out, zoom level, zoom in, reset, a fit-to-width control, a toggle to show or hide overlays, and a toggle for labels. On the right of the toolbar, a download-free "Copy job ID" affordance in monospace.
>
> **The detail panel** contains three stacked blocks:
>
> - **Summary** — the task name, a count like "14 objects detected", and a compact monospace run-details list: model, resolution, inference time, result schema version.
> - **Detections table** — every region as a row: class, confidence, and position. Confidence renders as both a number and a very small inline bar. Rows are selectable; selecting a row highlights the matching region in the image, and selecting a region in the image scrolls the table to its row and highlights it. This two-way link is essential.
> - **Actions** — quiet text buttons: "View raw result", "Run another job on this file", "Delete this job".
>
> **Accessibility, which changes the design.** The regions are navigable by keyboard as a single group: one Tab stop enters the region layer, then arrow keys move between regions. Show this by giving the region layer a visible cyan focus ring around the whole image when it holds focus, and a stronger highlight on the active region. Do not design hundreds of individually tabbable elements.
>
> **Video variant.** When the result is from a video, add beneath the image a frame strip: a horizontal row of small frame thumbnails with the current frame marked, plus previous and next frame controls and a monospace frame counter `frame 42 / 300`. For tracking results, each tracked object keeps a consistent colour across frames, and the detail panel groups rows by tracked object rather than listing every frame separately — one row per object, expandable to show its per-frame entries.
>
> **Responsive.** Desktop: two columns side by side. Tablet: image full width on top, detail panel below, table full width. Mobile: image full width first with pinch-zoom plus visible zoom buttons for those who cannot pinch, then a segmented control switching between "Detections" and "Details" so the panel content does not push the image far off screen. On mobile the table drops the position column, keeping class and confidence.
>
> **Do not add:** annotation or editing tools, a comparison slider, export to CSV or image, sharing links, or a re-run-with-different-settings control inside this screen. Results are read-only.

---

## 13. Results — dense tasks

> **[paste the design system block first]**
>
> Design the results viewer for SightForge for the two tasks that produce a dense per-pixel output — semantic segmentation and depth estimation. Design it for depth estimation; the same layout serves semantic segmentation. Show it inside the application shell.
>
> These outputs have no discrete objects to list, so this screen differs from the region-based results viewer in a specific way: there is no detections table, and the detail panel is a summary rather than an enumeration.
>
> **Desktop layout.** Two columns, the same 65/35 split as the region results screen so the two feel like the same product.
>
> **The visualization.** The source image with a colourised depth map overlaid on top. Above it, a toolbar containing the zoom controls, plus — and this is the key control for this screen — an **overlay opacity slider** letting the user fade between the original photo and the depth map. Place it prominently; comparing the two is the main thing a person does here.
>
> Beneath the image, a **colour scale legend**: a horizontal gradient bar with axis labels in monospace showing the actual metric range, such as `0.8 m` at one end and `24.5 m` at the other. For semantic segmentation this legend is instead a list of class swatches with names — and each swatch must carry a distinguishing pattern or texture as well as a colour, never colour alone.
>
> **The detail panel** contains:
>
> - **Summary** — task name and the monospace run-details list.
> - **Distribution** — a small histogram of depth values across the image, with the axis in real units. For semantic segmentation this becomes a list of classes with the percentage of the image each occupies, shown as small horizontal bars.
> - **Spatial breakdown** — a 3×3 grid representing regions of the image, each cell showing the average depth in that region in monospace. This exists so the information is available to someone who cannot see the colour map at all, and it should look like a deliberate part of the design rather than a fallback.
> - **Actions** — the same quiet text buttons as the region results screen.
>
> **Video variant.** The same frame strip and frame controls as the region results screen, with the depth map updating per frame.
>
> **Responsive.** Desktop: two columns. Tablet: image full width, opacity slider and legend directly beneath it, detail panel below. Mobile: image full width, opacity slider immediately below it as a full-width control with a large touch target, then legend, then the summary blocks stacked. The 3×3 spatial grid stays visible on mobile — it is small and it carries real information.
>
> **Do not add:** a 3D point cloud viewer, a measurement tool, per-pixel value inspection on hover, or export controls. The summary, the histogram, and the spatial grid are the whole analysis surface.

---

## 14. Results — classification

> **[paste the design system block first]**
>
> Design the results viewer for SightForge for image classification. Show it inside the application shell.
>
> Classification is different from every other task in this product: it produces no overlay, no regions, and nothing drawn on the image. It returns a ranked list of labels with confidence scores. The design must respect that rather than forcing it into the same shape as the other results screens — but it should still feel like the same product.
>
> **Desktop layout.** A centred single column, maximum 900px wide, rather than the two-column split used for the other result types. The image sits at the top at a comfortable size, unmodified, with no overlay.
>
> **Beneath the image, the ranked predictions.** This is the centrepiece and should be given real visual weight. Show the top five predictions as rows, each containing: the rank number in monospace, the class name in primary text at a larger size than usual, a horizontal confidence bar, and the confidence value in monospace at the right edge.
>
> The top prediction is visually elevated above the rest — larger type, a cyan-tinted bar, and a slightly raised surface — because in classification the first answer is usually the answer. Ranks two through five are progressively quieter, their bars muted grey rather than cyan.
>
> Below the top five, a collapsed "Show all predictions" control expanding to a compact scrollable table of the full ranked list.
>
> **Run details.** A monospace definition list beneath the predictions: model, resolution, inference time, schema version.
>
> **Video variant.** For a video, the top prediction is shown per frame — add a frame strip beneath the image, and show how the leading prediction changes across frames as a simple horizontal band of coloured segments with class names, so a viewer can see where the classification shifts.
>
> **Responsive.** Desktop and tablet: centred column, image large. Mobile: image full width, prediction rows stack with the confidence bar moving beneath the class name rather than beside it, and the top prediction keeps its emphasis. Never shrink the confidence bars to the point where the difference between 0.91 and 0.72 is not visible.
>
> **Do not add:** a confusion matrix, model explanation or saliency overlays, a "why this prediction" panel, or a correction and feedback control. The model returns ranked labels and nothing more.

---

## 15. Raw result inspector

> **[paste the design system block first]**
>
> Design the raw result inspector for SightForge — the panel that shows the underlying JSON document behind any analysis result. It opens from a "View raw result" action on any results screen.
>
> **Form.** A right-side drawer on desktop and tablet, roughly 560px wide, sliding in over the results screen with the content behind it dimmed. On mobile it is a full-screen sheet sliding up from the bottom.
>
> **Header.** The title "Raw result", the job identifier in monospace beside it, a copy-to-clipboard button, and a close button.
>
> **Body.** The JSON rendered as a navigable tree, not a wall of text. Objects and arrays are collapsible with disclosure triangles, indentation guides run down the left of each nested level, and syntax is colour-coded: keys in primary text, strings in a soft green, numbers in cyan, booleans and nulls in violet. Line numbers run down the left edge in muted monospace.
>
> The top two levels are expanded by default and everything deeper is collapsed, so the shape of the document is visible immediately without scrolling through hundreds of coordinate values.
>
> **A search field** pinned below the header filters keys and values, highlighting matches and auto-expanding the nodes that contain them.
>
> **Footer.** A single line showing the document size in monospace, such as `18.4 KB · 1,204 lines`.
>
> **Responsive.** Desktop and tablet: right drawer at fixed width, tree fully visible. Mobile: full-screen sheet, and long lines scroll horizontally rather than wrapping — wrapped JSON is unreadable. The search field stays pinned at the top while the tree scrolls beneath it.
>
> **Do not add:** editing, saving, a diff view, a schema validator, or a download button. This is a read-only inspector.

---

## 16. Account settings

> **[paste the design system block first]**
>
> Design the account settings screen for SightForge. Show it inside the application shell. This product has very few settings, so the screen should feel deliberately sparse rather than padded out with invented options.
>
> **Layout.** A single centred column, maximum 720px wide, made of stacked cards separated by generous vertical space.
>
> **Card one — Account.** The email address in monospace with a "Signed in" label. No editing; there is nothing to change.
>
> **Card two — Usage.** Today's activity as three small stat blocks in monospace: jobs run today against the daily allowance, total jobs all time, and storage used by stored results. Beneath them, a slim progress bar for the daily allowance that turns amber as it approaches the limit. A short muted line explains that limits reset daily at midnight UTC.
>
> **Card three — Data retention.** A plain-language explanation of what is kept and for how long, as three short rows: uploaded media kept 7 days after a job completes, media from failed jobs kept 14 days for debugging, results kept 30 days. Present as facts, not settings — these are not adjustable.
>
> **Card four — Danger zone.** Visually separated from the rest with a red-tinted border rather than a red fill. Two actions, each with a heading, one line of explanation, and a right-aligned outlined red button:
>
> - "Delete all jobs" — removes every job, its media, and its results, keeping the account.
> - "Delete account" — removes the account and everything in it, permanently.
>
> Both open a confirmation dialog that lists exactly what will be removed as a bulleted list with real counts — "14 jobs, 14 source files, 12 results" — and requires typing the word `delete` into a field before the confirm button becomes enabled. The dialog's confirm button is red and its cancel button is the visually calmer of the two.
>
> **Responsive.** Desktop and tablet: centred column, stat blocks in a row of three. Mobile: full width with 16px margins, stat blocks stack vertically, and the danger-zone buttons become full width beneath their explanations rather than sitting to the right.
>
> **Do not add:** notification preferences, API keys, billing, team members, connected apps, a theme toggle, language settings, or profile photos. None of these exist in this product.

---

## 17. Service capacity state

> **[paste the design system block first]**
>
> Design the screen SightForge shows when the service has hit its daily capacity limit and cannot accept new work. This is a real state in this product: it runs on a free infrastructure tier with a fixed daily request allowance, and when that is exhausted the interface must say so honestly instead of failing with a generic error.
>
> **Layout.** A centred single column, maximum 560px wide, vertically centred in the viewport, with the application shell's navigation still visible but its "New job" button disabled.
>
> **Content.** A restrained icon — a paused or gauge-at-limit motif, not an alarming error symbol. A heading reading "At capacity for today". Two short paragraphs: the first says the service has reached its daily limit and new jobs cannot start right now; the second explains plainly that SightForge runs on a free tier with a fixed daily allowance which resets at midnight UTC, and that this is a deliberate cost ceiling rather than a fault.
>
> Beneath that, a monospace line showing when the allowance resets — `Resets in 6h 12m`.
>
> Two actions: a primary outlined button "View the demo gallery", since the gallery is static and still works, and a secondary text link "Read the source". Existing completed results remain viewable, so include a third quiet link: "Your past results are still available".
>
> The tone here is important. This should read as a considered engineering trade-off explained to a peer, not as an apology or an upsell.
>
> **Responsive.** Desktop and tablet: centred card. Mobile: full width with 16px margins, actions become full-width stacked buttons.
>
> **Do not add:** an upgrade prompt, a pricing link, a waitlist, an email-me-when-available form, or a retry button. There is no paid tier and retrying will not help.

---

## 18. Empty, error, and loading states

> **[paste the design system block first]**
>
> Design a single reference sheet showing every non-happy-path state in SightForge, arranged as a grid of labelled panels so they can be compared for consistency. All of them share one structure: a restrained icon, a heading, one or two lines of explanatory text, and at most two actions.
>
> **Empty states** — four panels:
>
> - No jobs yet — "Run your first job", plus a link to the demo gallery
> - No jobs match the current filters — "Clear filters"
> - Results expired — explaining that results are kept for 30 days and this job's have passed that window, with the job's own details still shown above
> - No results in this frame — for a video frame where the model found nothing
>
> **Error states** — four panels:
>
> - Connection lost — a slim amber banner rather than a full-page state, reading "Reconnecting…" with a quiet animated indicator, since live updates drop and recover routinely
> - Result failed to load — with a retry action
> - Page not found — with a link back to the job list
> - Something went wrong — a generic fallback carrying a copyable error reference in monospace
>
> **Loading states** — four panels:
>
> - Job list loading — skeleton rows matching the real row layout, with a subtle shimmer
> - Results loading — a skeleton of the two-column results layout
> - Image decoding — the image area with a soft pulse
> - Inline button loading — a button with its label replaced by a small spinner, at the same width so nothing shifts
>
> **Rules for all of them.** Skeletons mirror the real layout so nothing jumps when content arrives. Errors state what happened in plain language and offer one clear next step. No state is ever a bare spinner on an empty page. Icons are simple line drawings in muted grey, never illustrations with a mascot or character.
>
> **Responsive.** Show each panel at desktop width in the grid, and include a second row demonstrating the three most common — empty job list, connection lost, and job list loading — at mobile width, since the mobile versions need the illustration smaller and the actions full width.
>
> **Do not add:** error codes shown without explanation, humorous or apologetic copy, mascot illustrations, or animated GIFs.

---

## 19. Iterating after the first generation

**Fix the visual language before generating volume.** Get the landing page and the application shell right first. Everything else inherits from them, and re-doing fourteen screens because the surface treatment changed is avoidable work.

**When a generation is wrong, say what is wrong, not what you want instead.** "The detections table is competing with the image for attention" gets a better second attempt than "make the table smaller."

**Things Stitch will probably get wrong on the first pass**, worth checking every time:

- Overlay strokes come back coloured. They must be white over black — that is a WCAG requirement, not a preference.
- Label chips come back semi-transparent. They must be opaque, for the same reason.
- Monospace disappears from numeric data. Ask for it back explicitly; it is doing real work.
- The accent gets used as a large fill. It is for one primary action and active states only.
- Mobile layouts come back as squeezed desktop layouts rather than genuinely reconsidered ones. Ask for the mobile version specifically, as its own generation.

**Export to Figma once a screen is close**, not while it is still moving. Refinement is faster there than in another generation round.

**What to keep when you translate these to code.** The four things that carry the product's credibility are the monospace-for-data split, the white-on-black overlay treatment, the honest cold-start messaging, and the two-way link between the results table and the image. Everything else is negotiable.
