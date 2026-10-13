---
name: Wirefen
description: A clear, grounded produce marketplace and farming workspace.
colors:
  primary: "#234c36"
  primary-hover: "#173b28"
  background: "#f7f8f2"
  surface: "#ffffff"
  text: "#202d25"
  muted: "#59655c"
  border: "#dce1d7"
  selected: "#e9eee3"
  error: "#a72e26"
typography:
  headline:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "32px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  body:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  control: "7px"
  card: "12px"
spacing:
  small: "8px"
  medium: "16px"
  large: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
---

# Design System: Wirefen

## Overview

**Creative North Star: "The produce catalogue"**

Direction: produce catalogue. Operate mode. Familiar app shell, a green navigation rail, ivory work area, flat white produce cards. A shared harvest/volume fact strip is the signature detail across cards, listing details and admin tables.

Alternatives considered: cooperative identity, agricultural extension bulletins, seed packets, seasonal almanacs, farm-gate signage, botanical publishing, produce catalogue (selected). The user delegated visual selection. Map and reference-manual challengers lose product clarity; retain their systematic state language and disciplined density, without decorative map or paper metaphors.

## Colors

Forest primary, deep forest hover, ivory ground, white surfaces, dark green ink and muted botanical neutrals. Semantic CSS variables in `src/styles.css` map primitives to component roles. Small secondary labels use darkened greens meeting the reviewed contrast threshold.

## Typography

DM Sans is self-hosted in weights 400, 500, 600 and 700. Body is 14px desktop and 15px mobile; mobile form inputs use 16px. Page titles are 32px desktop, 28–29px mobile; card titles vary with layout. Tabular numerals are used for prices and tables.

## Layout

Responsive grid 3/2/1 columns; desktop side navigation becomes compact horizontal navigation on mobile. Accessible standard inputs and native dialog; visible focus, keyboard escape, loading/empty/error feedback. Reduced motion supported. Sample data explicitly marked. No invented operational statistics or endorsements.

The actual mobile navigation is a header toggle and hidden-until-open drawer. Desktop rail is 232px, reducing at 1200px and 960px. The drawer breakpoint is 700px. Small phone cards become one column at 420px. Admin tables scroll inside their own container.

## Elevation & Depth

Produce cards use thin borders without shadows. Popovers, native dialogs and notifications use soft offset shadows. The mobile drawer uses a subtle lateral shadow.

## Shapes

Cards and main panels use 12px corners. Buttons and form controls use 7px corners. Circular marks are restricted to avatars and compact save controls.

## Components

Primary actions use forest with white text. Secondary actions use a white surface and border. Focus uses a 3px amber outline with 3px offset. Disabled buttons remain semantically disabled. Inputs have visible labels and native validation. The volume/handling strip is shared across produce cards. Draft feedback remains visible on phones. Closed mobile navigation is hidden from keyboard navigation.

## Do's and Don'ts

- Do use real crop photographs as labeled sample/category illustrations.
- Do retain semantic HTML, visible focus, named controls and mobile save feedback.
- Do preserve the restrained palette and clear data hierarchy.
- Don't imply that a sample listing, verification status, or inquiry is a real transaction.
- Don't cache private API responses in the service worker.

## Account and install additions

Clerk dialogs inherit the forest primary color and self-hosted DM Sans. Onboarding uses a short role choice followed by contact and farm fields. The Get app surface pairs an install panel with numbered browser instructions. At 700px and below, a four-destination bottom navigation reserves safe-area space; the drawer retains full navigation and adjacent Settings/Get app controls. Install dismissal and completed installation have distinct status messages.

The first-visit installation invitation is a dismissible, nonmodal surface at the lower right on desktop and above mobile bottom navigation. It does not steal focus. First display, dismissal and installation are persistent decisions; confirmed installs suppress future invitations.
