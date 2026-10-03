# Configurator design system

## Principles
- Prioritize configuration work over marketing decoration.
- Keep compatibility confidence explicit: selected, conflicting, unresolved, and missing are visually distinct.
- Support Persian-first reading with strong RTL spacing while preserving readable LTR identifiers for SKUs and model names.
- Keep technical density high, but use layered disclosure so comparison and selection remain understandable.

## Visual language
- Core palette: industrial white (`#F4F7F8`), cool gray borders (`#DCE5E8`), navy text (`#162B3A`), and HPE-inspired green accents (`#01A982`), while preserving Ariaman's branded header and logo.
- Primary actions use a darker accessible green (`#00765A`). Green selection accents indicate a choice, not verified compatibility; warnings and conflicts retain amber and red chips and text.
- Cards, panels, and dialogs share rounded corners, subtle borders, and shallow shadows.

## Typography
- Use bundled Vazirmatn for Persian text and numbers, with robust local/system fallbacks (`Tahoma`, `Segoe UI`, `Arial`, `Inter`).
- Headings carry the hierarchy; technical identifiers use LTR monospace or Arial-style rendering to avoid bidi ambiguity.

## Components
- **Workload cards:** plain-language entry points with consistent iconography and state badges.
- **GPU solutions:** a third, independent NVIDIA entry. Discovery uses informal bilingual copy, optional unknown answers and expandable memory details. Memory-screen badges are not compatibility certifications. Selected solutions offer standalone sales inquiry first, then optional source-listed HPE servers; missing HPE evidence stays unresolved.
- **Header:** transparent Ariaman logo and company name (Pishro Dadeh Iranian Parseh); restart sits beside the brand text on desktop and below it on mobile, in both configurators.
- **Product hero:** a lightweight, accessible illustrative rack-server SVG identifying HPE, with hardware icons and a jump link to the current step; no internal catalog counts or decorative caption.
- **Advisor panels:** guided profiles plus compact label/input rows and expandable help, preserving the full guidance and accessible descriptions.
- **Server comparison cards:** model and generation labels stay isolated LTR on separate lines. A star marks the top recommendation, not verified compatibility. Compact chassis diagrams accompany platform tradeoffs, blockers, and source evidence before selection.
- **Category navigation:** expose required/selected/problem states per component group.
- Server category navigation and its Next action show controller before drives, without changing engine category definitions. Server and storage Start over actions live in the header and retain their confirmation dialogs.
- **Part cards:** pair technical identifiers with plain-language summaries and source-backed state chips.
- **Summary panel/drawer:** a light build sheet with the selected model's illustrative chassis and matching category icons; persistent on desktop and explicitly expandable on smaller screens. Existing calculations and issue states remain unchanged; SKUs are secondary.
- **Issue panels:** separate missing selections, known conflicts, unresolved checks, and workload advisories, with correction links to affected groups.
- **Dialogs:** modal evidence view with focus trapping and focus return.

## Motion and responsiveness
- Motion is limited to small entrance and hover transitions and is disabled for `prefers-reduced-motion`.
- Layout targets desktop comparison, tablet review, and a single-column mobile category workflow without changing the underlying product flow.
- Mobile headers stack branding above actions so product switching cannot squeeze the brand into a vertical column. Controls have at least 44px touch height; component tools, storage option actions, and disk-group fields stack on narrow screens.
- A skip link, visible focus treatment, modal scroll containment, translation-isolated identifiers, and long-text wrapping support keyboard, assistive-technology, RTL/LTR, and increased-text use.
