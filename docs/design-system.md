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
- Use a robust local/system fallback stack (`Tahoma`, `Segoe UI`, `Arial`, `Inter`) with Persian-first defaults.
- Headings carry the hierarchy; technical identifiers use LTR monospace or Arial-style rendering to avoid bidi ambiguity.

## Components
- **Workload cards:** plain-language entry points with consistent iconography and state badges.
- **Product hero:** a lightweight, explicitly illustrative rack-server SVG with hardware icons, a jump link to the current configuration step, and a compact catalog metrics strip.
- **Advisor panels:** guided profiles plus editable sizing inputs.
- **Server comparison cards:** use compact, non-product-specific chassis diagrams and show why a platform is relevant, tradeoffs, blockers, and source evidence before selection.
- **Category navigation:** expose required/selected/problem states per component group.
- **Part cards:** pair technical identifiers with plain-language summaries and source-backed state chips.
- **Summary panel/drawer:** a light build sheet with the selected model's illustrative chassis and matching category icons; persistent on desktop and explicitly expandable on smaller screens. Existing calculations and issue states remain unchanged; SKUs are secondary.
- **Issue panels:** separate missing selections, known conflicts, unresolved checks, and workload advisories, with correction links to affected groups.
- **Dialogs:** modal evidence view with focus trapping and focus return.

## Motion and responsiveness
- Motion is limited to small entrance and hover transitions and is disabled for `prefers-reduced-motion`.
- Layout targets desktop comparison, tablet review, and a single-column mobile category workflow without changing the underlying product flow.
- Mobile headers stack branding above actions so product switching cannot squeeze the brand into a vertical column. Controls have at least 44px touch height; component tools, storage option actions, and disk-group fields stack on narrow screens.
- A skip link, visible focus treatment, modal scroll containment, translation-isolated identifiers, and long-text wrapping support keyboard, assistive-technology, RTL/LTR, and increased-text use.
