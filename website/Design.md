# Website Design Specification – ApexMediation Platform (Study in Sweden Replica)

## Purpose and Scope

This specification provides a detailed visual recipe for designing the ad‑stack platform’s website. The goal is to faithfully reproduce the look and feel of StudyInSweden.se — its colour palette, typography, layout motifs and component styles — while adapting the structure to the ad‑stack platform. The document focuses exclusively on design, not on backend technologies. It is intended for designers and front‑end developers who will build the site using any technology stack. All visual details are described so that the site can be precisely reproduced, section by section. Note for v1.1: The aim is to replicate the visual appearance and overall user experience of the reference site rather than its exact behaviour. Do not spend time implementing bespoke interactive buttons or dynamic features (e.g. “Popular right now” buttons) unless they serve a purely visual purpose. Focus on matching the layout, colours, typography and feel. ## Overall Visual Theme

Colour Palette – Use bold contrasts inspired by the Swedish flag:

Deep blue backgrounds (#005293) are the dominant colour for most sections including the hero, footer and callouts【918573914928826†screenshot】. This colour should feel rich and saturated on both desktop and mobile.

Golden yellow (#FECB00) is used for large headlines, highlighted text, buttons and thin lines【918573914928826†screenshot】. A lighter variant (#FFD481) can be used for hover states.

Pale beige (#E8E3D1) appears in newsletter panels and emphasises contrast against blue backgrounds【866665676878550†screenshot】.

Accent red (#C04437) is used sparingly for decorative elements like emojis or small icons.

Maintain a high contrast ratio between foreground and background colours for accessibility.

Typography – The site uses the Sweden Sans family (book and bold weights):

Headlines (h1/h2) are set in bold, uppercase text with generous tracking (letter spacing around +0.02em). They often appear in golden yellow on blue backgrounds【918573914928826†screenshot】 or white on beige backgrounds【866665676878550†screenshot】.

Body copy uses the book weight with slightly negative letter spacing (–0.02em) to tighten the text. Body text is white on blue backgrounds or blue on yellow backgrounds【918573914928826†screenshot】.

Link styles are underlined when hovered; base state uses the body copy colour.

Ensure a vertical rhythm by pairing headlines with double or triple line height spacing above and below.

Layout Principles – The design is modular and flexible:

Generous whitespace: leave large margins and padding around text and between sections to allow content to breathe.

Full‑width backgrounds: each major section uses a solid colour fill (blue or beige) that spans the entire viewport width.

Grid system: use a 12‑column responsive grid; components (callouts, footers) align to this grid. On narrow viewports, columns stack vertically.

Scalloped edges: the top notification banner features a wavy bottom edge separating it from the hero section【918573914928826†screenshot】. Recreate this using an SVG or CSS clip‑path.

Imagery & Icons – Images are used sparingly but framed with thick golden borders; icons are simple line icons in white on blue or blue on yellow. Use emoji sparingly to humanise headings (e.g. the peace sign on the hero banner【918573914928826†screenshot】).

## Component Recipes

This section outlines the construction of each major component found on the reference site. Follow the sequences precisely for reproducibility.

### 1. Top Notification Bar

Background & Shape – A narrow bar across the top of the page filled with golden yellow (#FECB00). The bottom of the bar is scalloped, creating a playful wave that overlaps onto the hero section【918573914928826†screenshot】. Implement with an SVG path or CSS clip‑path.

Content Placement – Place the logo on the left and an announcement message centred or left aligned. Use white or deep blue text. At the right, include a small close button (×) in deep blue.

Typography – Use Sweden Sans book weight for the message; set the font size to 14–16 px with generous line height.

Responsiveness – On mobile, collapse the message into a shorter sentence; ensure the close button remains accessible.

### 2. Main Navigation

Horizontal Menu – Set within the hero area. Use uppercase golden yellow text for each navigation item (e.g. “PLAN YOUR STUDIES”) separated by medium spacing【918573914928826†screenshot】. The menu sits towards the top of the hero section, centred horizontally.

Hamburger Menu (Mobile) – On narrow screens, replace the horizontal items with a hamburger icon (three lines). When clicked, show a full‑screen overlay with menu items stacked vertically, retaining the same colours.

Interactive States – On hover or focus, underline the link using a 2 px golden yellow line; text remains golden. On active state (current page), keep the underline persistent.

Search & Utility Icons – The rightmost portion of the navigation includes a search icon and optionally a login/user icon, both white outlines on a golden circle.

### 3. Hero Section

Background – Fill the full viewport width (and at least half the height) with deep blue (#005293). Ensure no visible gradients.

Headline – Position the main headline centrally or slightly left; set in bold, uppercase Sweden Sans; size around 72–96 px for desktop. Colour it golden yellow. Insert an emoji (e.g., peace sign) at the end of the line to add playfulness【918573914928826†screenshot】. Align the emoji baseline with the text.

Sub‑headline/Subtitle – Place a smaller sentence below the headline in white or yellow. Keep the width constrained to half of the viewport on desktop. Use a smaller font size (24–32 px) and book weight.

Call to Action (CTA) – To the right or below the headline, include a short line of text (e.g., “Discover more about our ad stack”) in golden yellow. You may accompany this text with a small arrow symbol for decoration【918573914928826†screenshot】. The goal is aesthetic consistency; specific hover animations or behaviours are optional and can be omitted.

Pause Animation Link – Under the headline, provide a small link for “Pause animation” (if using background animations). Use regular book weight, blue or yellow text with underline on hover.

Cookie Banner Integration – The hero sits behind a cookie banner at the bottom of the viewport until the user accepts cookies. This is described in the cookie banner recipe below.

### 4. Callout Sections

The website uses several callout sections to highlight popular content or features. Each callout is a card with a blue background and golden headline.

Popular Right Now

Create a full‑width section with deep blue background. At the top, place a small uppercase heading (“Popular right now”) in golden yellow, spaced above the cards【760654022691989†screenshot】.

Arrange two or three cards side by side on desktop; stack them vertically on mobile. Each card has a thin golden line at the top and bottom, and a golden headline set in bold uppercase Sweden Sans. Beneath the headline, include a short description in white book weight.

At the bottom right of each card, you may place a small arrow or “Learn more” label in golden yellow purely for visual appeal. There is no need to implement complex hover animations or button functionality; ensure the cards maintain their clean appearance when hovered.

Newsletter Sign‑up Panel

Use a pale beige background (#E8E3D1) with deep blue headings and body text【866665676878550†screenshot】. The panel spans the full width of the container but with generous padding (40–60 px). Split into two columns: left column contains heading and description, right column contains an email input field and a golden yellow button.

Input styling: white background, thin blue border, subtle rounded corners (4 px). Placeholder text is blue (#005293) at 50% opacity. On focus, the border becomes golden.

Button: golden yellow with blue text; corners are slightly rounded (4 px). For visual fidelity, you can include a subtle shadow; hover darkening is optional and can be simplified to keep implementation straightforward.

Blog/Quiz Callouts

Position within a pale beige background for contrast. Each callout consists of a vertical stack: an image with a thick golden border on the left, a bold blue headline on the right, and a golden arrow icon indicating forward navigation【117813166816926†screenshot】. Use consistent image aspect ratio (e.g., 16:9) and crop images accordingly.

The headline uses uppercase Sweden Sans bold; the body copy uses book weight. The arrow icon (if used) should be golden yellow on blue or beige background.

For simplicity, avoid elaborate hover effects. Maintain consistent card backgrounds when hovered, focusing on the static design instead of interactive animations.

“The Swedish Way” Section

Use a pale beige background with deep blue text. Compose two columns: the left column contains large blue heading and body copy; the right column features a photo framed with a thick golden border【866665676878550†screenshot】.

The heading uses upper and lowercase letters; the body copy is book weight with ample line height. Spacing between paragraphs is generous (1.5em).

Add small golden decorative lines separating subsections. If you include a call‑to‑action (“Find out more”), treat it as a static label rather than a dynamic button; replicate the appearance of the reference without implementing advanced behaviours.

### 5. Footer

Background – Fill with deep blue (#005293) and extend edge to edge【1231473717059†screenshot】.

Column Layout – Divide into multiple columns (on desktop) or stacked sections (on mobile): “About this site,” “Latest news,” “Other official sites,” “Newsletter,” and “Follow us.” Use a grid to align columns evenly.

Headings & Text – Each column heading is set in golden yellow, uppercase Sweden Sans bold. Body text is white book weight. Insert thin golden lines underneath headings for separation【1231473717059†screenshot】.

Links – Use underlined white text; you may apply a golden colour on hover if desired, but the primary requirement is to match the static appearance. External links should include a small blue arrow icon indicating a new window (replicate from the reference footnote). For the newsletter block, provide a simple sign‑up link rather than a full form.

Logos – At the bottom left, display partner logos (e.g. Sweden Sverige and Swedish Institute) with adequate padding【1231473717059†screenshot】. Ensure logos are rendered in full colour on a blue background. Align them horizontally on desktop or stack them on mobile.

Social Icons – Under “Follow us,” include icons for YouTube, Facebook and Instagram. Render icons in white on deep blue backgrounds with appropriate spacing【1231473717059†screenshot】. Hover colour shifts are optional; prioritise the static look.

Copyright – At the very bottom, centre‑align a small line of text (“Copyright © 2025 Swedish Institute.”) in white with a reduced font size (12 px).

### 6. Cookie Banner

Position – Fixed to the bottom of the viewport until dismissed.

Background – Pale yellow (#F9E7A3) with deep blue text; this contrasts with the blue hero behind it【918573914928826†screenshot】.

Text – Provide a concise message about cookie usage in book weight Sweden Sans. Use a font size of 14 px and line height of 20 px.

Buttons/Links – Include two actions: “Cookie settings” and “Accept all cookies.” For design fidelity, style “Cookie settings” as an underlined deep blue link and “Accept all cookies” as a pill‑shaped golden yellow element with a cookie emoji on the left. Hover effects and dismissal logic are beyond the scope of this design‑only document; focus on the static appearance.

Dismissal – Behavioural logic (e.g. hiding the banner after acceptance) is not required for this design recipe. You may simulate the banner as a fixed element at the bottom of the page.

## Responsive Behaviour

Breakpoints – Use standard breakpoints (e.g., 1280 px, 960 px, 600 px). At each point, adjust font sizes, image aspect ratios and column stacking.

Typography Scaling – Reduce headline sizes proportionally on smaller devices (e.g., hero headline from 96 px on desktop to 48 px on mobile). Maintain the letter spacing and uppercase styling.

Navigation – Switch to a hamburger menu below 960 px. Provide a slide‑in panel from the left with large tappable links. Include a semi‑transparent overlay behind the panel.

Cards & Columns – Stack callout cards vertically and increase vertical spacing. Convert multi‑column footers into a single column list with headings separating sections.

## Implementation Checklist (Recipe Format)

To ensure absolute reproducibility, follow these step‑by‑step guidelines:

Set up Styles

Define global CSS variables or styles for colours: deep blue (#005293), golden yellow (#FECB00), pale beige (#E8E3D1), accent red (#C04437), white (#FFFFFF). Use them consistently across the site.

Import the Sweden Sans font in book and bold weights; define styles for h1–h6 and body text with appropriate sizes and letter‑spacing.

Build the Base Layout

Create a header component containing the top notification bar (scalloped) and navigation bar.

Implement a responsive grid system (12 columns) and set global margins and padding.

Prepare section containers for hero, callouts, newsletter, feature sections and footer.

Construct Each Section

Header: Place the logo on the left, message in the middle, and close icon on the right of the top bar. Underneath, place navigation items or hamburger menu.

Hero: Position the main headline and CTA on a deep blue background. Add an emoji to the headline. Include a pause link for any animations.

Callout Cards: Create card components with top and bottom borders in golden yellow. Insert titles, descriptions and CTA arrows. Ensure equal heights.

Newsletter Panel: Design a pale beige section with text and form fields. Use a responsive layout for two columns.

Blog/Quiz Callouts: Build a two‑column layout with image and text. Wrap images with thick golden borders. Add interactive arrow icons.

Feature/Philosophy Section: Use the Swedish Way layout with text and image. Frame images with golden borders.

Footer: Divide into columns with headings and content. Include logos and social icons. Conclude with a copyright line.

Cookie Banner: Implement a fixed banner at the bottom with the specified colours and actions. Provide fade‑out animation on acceptance.

Responsive Adjustments

Use CSS media queries to change layout from multi‑column to single‑column on narrow screens.

Adjust font sizes and spacing for readability on small devices.

Polish and Testing

Verify colour contrast meets accessibility guidelines (WCAG). Adjust if necessary while staying close to the reference palette.

Check that the scalloped edge renders crisply on all devices.

Test the navigation overlay, card hover states, newsletter form interactions and cookie banner dismissal.

Compare side by side with the reference site to ensure accurate reproduction.

## Conclusion

By following this design recipe, a front‑end developer can recreate a website that visually mirrors StudyInSweden.se with high fidelity. This specification covers the colour palette, typography, layout, components, responsive behaviour and step‑by‑step instructions needed to achieve a polished, professional design. Although the underlying ad‑stack platform may use different backend technology, adhering to these design guidelines will ensure a consistent and recognisable user interface.
