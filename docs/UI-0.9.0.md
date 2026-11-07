# v0.9.0 UI direction

This is a presentation and accessibility pass for the desktop Chrome extension. Students should be able to connect their browser, then scan a familiar semester/course/module outline to find one file or piece of module context. Connect, Resources, Settings and Advanced retain their existing jobs and navigation.

The Apple Design skill supplied by the user informs the foundations: legibility, hierarchy, consistent controls and adaptable layouts. Browser-native HTML controls and Chrome conventions remain appropriate for this web extension. This is not a claim of native Apple platform compliance.

## Review and priorities

- **Critical: readability:** the old 9px file-type label used `#9aa0ad` on `#f6f7fb`, approximately 2.45:1. It now uses a roughly 12px label and semantic secondary text, 5.64:1 on its off-white light surface. `accessibility.md › Vision`: “Strive to meet color contrast minimum standards.”
- **High — secondary content:** the old module link used `#8c7c9d` on `#f6f7fb`, approximately 3.58:1. Secondary links and helper text now share a darker, readable role. `typography.md › Ensuring legibility`: “Test legibility in different contexts.”
- **Medium — consistency:** unify button sizing, borders, hover/press/focus states and outline spacing. Keep one prominent semester-sync action and the existing inline download/Save as pair. `buttons.md › Style`: “Keep the number of prominent buttons to one or two per view.”
- **Medium — adaptation:** semantic CSS properties supply light/dark palettes; compact layouts wrap, and larger text keeps controls reachable. `layout.md › Adaptability`: “Be prepared for text-size changes.”

Keep the course sidebar, native disclosure controls, scoped search, automatic matching-note expansion, soft deepest-match emphasis and advanced controls. The outline already expresses the product's subject; a new navigation model would add work without helping the requested task.

## Token system

The six core color roles below have light and dark variants. Borders, selection fills and feedback fills are secondary tokens in `extension/popup.css`. Ratios use WCAG relative luminance, computed from the actual hex values.

| Role | Light | Dark | Text contrast against surface, light / dark |
| --- | --- | --- | --- |
| Canvas | `#efeff2` | `#161619` | Background role |
| Surface | `#f7f7f9` | `#1f1f23` | Background role |
| Content | `#242428` | `#eeeef1` | 14.45:1 / 14.18:1 |
| Secondary content | `#62626c` | `#b0b0bb` | 5.64:1 / 7.64:1 |
| Accent | `#6543a3` | `#c2a2ff` | 6.80:1 / 7.75:1 |
| Success indicator | `#26704b` | `#86d9a6` | 5.61:1 / 9.77:1 |

Secondary content on the light canvas is 5.25:1 and on the selected neutral fill is 4.90:1. Primary button labels use a dedicated foreground role: white on the light accent is 7.28:1; `#241633` on the dark accent is 8.00:1. Status also has a text label. Increased contrast and forced colors have explicit styles.

System UI type carries the whole interface: roughly 14px body, 13px filenames, 12px file types/helper labels, 23px page headings and 28px course headings at the default browser font setting. Sizes use rem units so text preferences can scale. A monospace face is limited to pairing codes and file-type/data labels. The small existing document mark carries identity once per header.

## Layout and signature

Keep a course sidebar beside the outline at regular widths; stack the semester/course chooser above the outline in compact windows. Preserve room for readable filenames and inline actions.

```text
Regular                             Compact
Brand / Resources     Sync           Brand / Resources
--------------------------------    Open Brightspace / Advanced / Sync
Semester | Course title              Semester / courses (scroll)
Courses  | Search                    Course title / search
         | Module                    Module
         |  Notes                     Notes
         |  PDF  File   ↓ Save as     PDF File
         |  PPTX File   ↓ Save as     ↓ Save as
```

The signature is the course outline itself: clear indentation, readable file-type labels and a soft fill on the deepest matching resource. A full neutral border and stronger text weight distinguish the selected course. Content surfaces are flat and opaque, with off-white surfaces in the light appearance. Motion is limited to brief pointer feedback, with a reduced-motion override.

## User's visual constraints

Favor flat, restrained product UI. Avoid harsh gradients, pure-white page/panel backgrounds, decorative drop shadows, rainbow accents, colored selection side stripes, glass effects, emoji decoration, template feature-card rows, bento layouts, faux terminal panels, fabricated testimonials and contrastive marketing slogans. Use the platform font stack. Avoid em dashes in product-authored UI copy.

Keep symbols limited to recognizable actions such as Download, Settings and Close, with accessible labels. Color should communicate a primary action, search relevance or an actual status. Preserve keyboard-focus outlines and meaningful hover/press feedback. Real diagnostics stay in Advanced; they are not decoration. These preferences apply to future product surfaces as well as this extension pass.

The restrained follow-up removes panel/dialog shadows, status halos and colored side stripes. Its connected popup preview measures about 578px tall at 390px width, with the footer links on one row inside a 600px viewport. Light secondary text retains at least 4.90:1 contrast on the tested neutral fills. The developer attachment folder is excluded from source control; reference images are not product assets.

## Semester control and manual appearance

The semester selector uses a flat neutral fill, clearer value text and a small chevron. Its open menu is now a local select-only combobox with rounded corners, theme-matched option states and a checkmark for the selected semester, replacing Chrome's unstyleable native options panel. Arrow keys, Home/End and type-ahead navigate; Enter/Space or a click selects, Tab accepts the active option, and Escape/outside dismissal cancels. The list scrolls and opens above a control near the viewport bottom. The original select still supplies values and change events to semester/course loading. Four regression tests cover selection versus cancellation, type-ahead, refreshing options, loading placeholders and placement.

At the user's explicit request, both headers include a compact sun/moon appearance switch. This overrides the skill's general recommendation to rely only on the system preference. The initial theme follows the system until the user chooses light or dark. The saved `uiAppearance` preference is shared through Chrome local storage; a localStorage mirror applies it before the stylesheet paints. Open extension pages update together, and later system changes do not override an explicit choice.

The control has a stable Dark mode switch label, a checked state, native button keyboard handling and a short thumb movement. Reduced-motion preferences disable that movement. A failed save restores the prior appearance and announces the error. Four tests cover system/manual selection, persistence and cross-page updates, delayed initial reads and failed saves. Browser previews confirmed dark/light switching with Space, persistence into Connect, the unchanged 390px popup width and its single-row footer. The browser upload now contains 30 files including the local appearance, semester-picker and motion scripts. The picker was checked in both themes with a synthetic nine-semester list; switching semesters updates the course view.

## Restrained interaction motion

The semester menu fades and moves four pixels over 150 ms when opening and 110 ms when closing. An exiting list immediately becomes inert and hidden from assistive technology; a stale close cannot hide a reopened list. Module folders and notes expand over 170 ms and collapse over 120 ms. Deliberate summary activation alone animates, so saved-folder restoration, semester selection and search-driven expansion remain immediate. Rapid activation reverses the current animation, and a nested disclosure releases an animating ancestor's height before expanding.

The appearance thumb slides over 170 ms, with a small sun/moon rotation and opacity change. Surfaces, borders and text transition over 180 ms. Theme transitions are enabled only after the saved preference resolves, avoiding a startup fade. CSS transitions and JavaScript animations honor reduced motion by default; an explicit extension preference can override it. This follows `motion.md › Best practices` and `Providing feedback`: brief, optional motion that can be interrupted.

All 107 tests pass, including five motion regressions for canceled exits, immediate/reduced-motion behavior and disclosure reversals. Syntax and the 30-file extension ZIP validate. Browser checks exercised keyboard expansion, notes, menu dismissal/reopening and immediate search. The in-app browser requests reduced motion; a separate synthetic preview override exercised normal motion without changing OS settings. These previews do not replace final visual acceptance in standalone Chrome.

## Extension-only animation preference

Resources → Advanced and Connect → Settings share a native radio group for Animations: Follow system, On, Off. Follow system is the default. On enables the extension's CSS transitions and JavaScript animations even when Windows animations are disabled; Off disables both independently. This is an explicit user-requested override, without changing the OS preference. A status line reports the effective setting.

The `uiMotion` Chrome local preference is shared across open pages, with a synchronous localStorage mirror before the stylesheet paints. Unknown values fall back to system behavior, delayed reads cannot overwrite a newer selection, and failed writes restore the previous choice with an accessible error. Five preference tests cover these cases; motion tests also verify On under a reduced-motion system and Off under an animated system. Browser checks confirmed both CSS states and persistence from Resources into Connect. All 107 tests pass, syntax checks pass, and the store ZIP validates with 30 files. Standalone Chrome acceptance remains a user check after reloading.

## Verification and limits

- All 83 existing behavior tests pass after the initial UI pass; generated bundles, syntax and extension ZIP checks pass.
- Synthetic browser previews exercised search highlights, automatic matching notes, first-time pairing with Enter, and Settings entry/return using the keyboard. Focus moves to Back to Connect and returns to Settings.
- Light/dark previews were inspected. At 390px width, both Resources and Connect at 200% text had no document-level horizontal overflow. This checks layout adaptation; it does not establish comprehensive screen-reader or Windows forced-colors acceptance.
- Module-note text can receive keyboard focus for scrolling on the minimum supported Chrome version.
- The search follow-up passes all 86 behavior tests, including three regressions for inherited partial hits, selective expansion and completed-word boundaries. Module names no longer supply missing query terms to promote partial child matches. A title-only result stays collapsed; only paths to relevant deeper files/notes expand. Earlier words are whole-word matches and only the final unfinished word accepts prefixes. Path-scoped queries such as `week 3 worksheet` remain supported when the filename supplies a missing term.
- A further notes follow-up uses one shared passage matcher for result eligibility and highlighting. Every query term must occur within the same logical notes line/paragraph, not scattered across separate schedule entries. Other entries remain readable as plain context. Regression cases cover `Medical Ethics II` versus unrelated `Algorithms II`, a false match assembled across different weeks, and preserved CRLF/Unicode/untrusted plain text. A module and its matching notes can count as a valid source without treating every line in those notes as another result.
- A live Chrome report exposed action-popup sizing feedback from `max-width: 100vw`. The popup document and body now declare a fixed 390px width/minimum width, so Chrome's temporary initial viewport cannot shrink the layout. The user confirmed that the width is normal after reopening. Footer gaps and footnote/footer margins were then reduced to keep support links on one row at the default text size; wrapping remains available for larger text. The footer adjustment still needs live confirmation.
- The `codex/ui-0.9.0` branch isolates this pass. The v0.8.9 packages and release record remain intact. v0.9.0 still needs visual acceptance and a matching published companion download before release/store submission; its candidate download URL is not yet live.

References read from the installed skill: accessibility, layout, typography, color, designing for macOS, cross-platform translation, buttons, sidebars, search fields and dark mode. Additional design choices above are product judgment, not additional Apple requirements.

## Course-sync ring (development follow-up)

Resources now shows one circular segment per course in a larger, flat sync notice. A segment turns purple only after that course is saved successfully; unfinished segments stay neutral, including the course currently scanning. Failed and login-skipped courses use separate dashed states and explicit text counts. Unknown course counts use an indeterminate arc until discovery finishes. The center and accessible progress value count successful syncs, never skipped/failed courses.

Manual and MCP-driven scans publish per-course snapshots before and after each result, including the final course. Completion keeps the full ring visible briefly before dismissing after 4.5 seconds; warning/error notices stay available. A stale success is hidden on page startup, and an old dismissal timer cannot hide a newer scan. Motion follows the existing extension-only preference, with system/reduced-motion defaults preserved. This applies the accuracy and transient-feedback guidance in `progress-indicators.md`.

All 115 tests pass, including per-course progress isolation, final-course completion, login-skipped courses, 1–200 segment geometry, success/error counts and dismissal races. Syntax and the 31-file source package validate. Synthetic browser previews checked both themes and progression to 5/5. This follow-up changes the development extension; the previously tested v0.9.0 Windows installer/ZIP checkpoint and its hashes remain unchanged until the next packaging pass.
