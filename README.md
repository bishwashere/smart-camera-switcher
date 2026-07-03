# Smart Camera Switcher

Smart Camera Switcher is a Home Assistant Lovelace custom card for showing one active camera feed with circular camera selectors underneath it.

This card can be installed manually or through HACS as a custom repository.

## HACS custom repository install

1. In HACS, open **Custom repositories**.
2. Add `https://github.com/bishwashere/smart-camera-switcher`.
3. Select category **Lovelace**.
4. Install the card.
5. Add the card to your dashboard using `custom:smart-camera-switcher`.

After install, the resource should point to the installed JavaScript file managed by HACS.

## Local install while developing

Copy `dist/smart-camera-switcher.js` into Home Assistant:

```bash
cp dist/smart-camera-switcher.js /config/www/smart-camera-switcher.js
```

Add it as a Lovelace resource:

```yaml
url: /local/smart-camera-switcher.js
type: module
```

## Example card

```yaml
type: custom:smart-camera-switcher
title: Smart Camera
active_entity: sensor.active_camera
selector_entity: input_select.smart_camera_selected
max_height: 25vh
cameras:
  - id: cam1
    entity: camera.cam1_fluent
    name: Cam 1
  - id: cam2
    entity: camera.cam2_fluent
    name: Cam 2
  - id: cam3
    entity: camera.cam3_fluent
    name: Cam 3
  - id: cam4
    entity: camera.cam4_fluent
    name: Cam 4
  - id: cam5
    entity: camera.cam5_fluent
    name: Cam 5
  - id: cam6
    entity: camera.cam6_fluent
    name: Cam 6
```

## Helper entities used by the original setup

The original dashboard used an `input_select` for manual selection and a template sensor for motion-following auto selection. These helpers stay in Home Assistant config for now.

```yaml
input_select:
  smart_camera_selected:
    name: Smart Camera Selection
    options:
      - auto
      - cam1
      - cam2
      - cam3
      - cam4
      - cam5
      - cam6
    initial: auto
    icon: mdi:cctv
```

## Status

- Local repo scaffolded
- Card extracted into standalone JS
- HACS custom repository metadata added
- Needs testing in the live dashboard before release packaging
