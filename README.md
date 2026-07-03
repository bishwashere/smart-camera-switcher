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
active_entity: sensor.active_camera_example
selector_entity: input_select.camera_selector
max_height: 25vh
cameras:
  - id: front_door
    entity: camera.front_door
    name: Front Door
  - id: driveway
    entity: camera.driveway
    name: Driveway
  - id: back_yard
    entity: camera.back_yard
    name: Back Yard
  - id: garage
    entity: camera.garage
    name: Garage
  - id: side_yard
    entity: camera.side_yard
    name: Side Yard
  - id: patio
    entity: camera.patio
    name: Patio
```

## Helper entities used by the original setup

The original dashboard used an `input_select` for manual selection and a template sensor for motion-following auto selection. These helpers stay in Home Assistant config for now.

```yaml
input_select:
  camera_selector:
    name: Camera Selection
    options:
      - auto
      - front_door
      - driveway
      - back_yard
      - garage
      - side_yard
      - patio
    initial: auto
    icon: mdi:cctv
```

## Status

- Local repo scaffolded
- Card extracted into standalone JS
- HACS custom repository metadata added
- Needs testing in the live dashboard before release packaging
