# Configurator design system

## Principles
- Prioritize configuration work over marketing decoration.
- Keep compatibility confidence explicit: selected, conflicting, unresolved, and missing are visually distinct.
- Support Persian-first reading with strong RTL spacing while preserving readable LTR identifiers for SKUs and model names.
- Keep technical density high, but use layered disclosure so comparison and selection remain understandable.

## Visual language
- Core palette: restrained navy surfaces, neutral backgrounds, and teal/cyan accents.
- Primary actions use solid blue emphasis; warnings and conflicts use amber and red background chips instead of color alone.
- Cards, panels, and dialogs share rounded corners, subtle borders, and shallow shadows.

## Typography
- Use a robust local/system fallback stack (`Tahoma`, `Segoe UI`, `Arial`, `Inter`) with Persian-first defaults.
- Headings carry the hierarchy; technical identifiers use LTR monospace or Arial-style rendering to avoid bidi ambiguity.

## Components
- **Workload cards:** plain-language entry points with consistent iconography and state badges.
- **Advisor panels:** guided profiles plus editable sizing inputs.
- **Server comparison cards:** show why a platform is relevant, tradeoffs, and blockers before selection.
- **Category navigation:** expose required/selected/problem states per component group.
- **Part cards:** pair technical identifiers with plain-language summaries and source-backed state chips.
- **Summary panel/drawer:** persistent on desktop, explicit drawer on smaller screens.
- **Issue panels:** separate missing selections, known conflicts, unresolved checks, and workload gaps.
- **Dialogs:** modal evidence view with focus trapping and focus return.

## Motion and responsiveness
- Motion is limited to small entrance and hover transitions and is disabled for `prefers-reduced-motion`.
- Layout targets desktop comparison, tablet review, and mobile summary drawer workflows without changing the underlying product flow.
