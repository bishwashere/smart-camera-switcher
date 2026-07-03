# Smart Camera Switcher

Smart Camera Switcher is a Home Assistant Lovelace custom card that shows one active camera feed with circular camera selectors underneath it.

## Installation

### HACS custom repository

1. In Home Assistant, open **HACS**.
2. Click the top-right three-dot menu.
3. Open **Custom repositories**.
4. Add this repository URL:

   `https://github.com/bishwashere/smart-camera-switcher`

5. Set **Type** to **Dashboard**.
6. Click **Add**.
7. Go back to HACS and search for **Smart Camera Switcher**.
8. Open **Smart Camera Switcher**.
9. Click the top-right three-dot menu.
10. Click **Download**.
11. Refresh your browser after HACS finishes installing it.

### Manual install

1. Download `dist/smart-camera-switcher.js` from this repository.
2. Copy it to your Home Assistant `www` folder as:

   `/config/www/smart-camera-switcher.js`

3. Add it as a Lovelace resource:

```yaml
url: /local/smart-camera-switcher.js
type: module
```

4. Refresh your browser.

## Basic Example

```yaml
type: custom:smart-camera-switcher
title: Smart Camera
selector_entity: input_select.camera_selector
cameras:
  - id: front_door
    entity: camera.front_door
    name: Front Door
  - id: driveway
    entity: camera.driveway
    name: Driveway
```

## Auto-Selected Camera Example

Use `active_entity` when another sensor decides which camera should be shown. If `selector_entity` is set to anything other than `auto`, manual selection wins.

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
```

## Configuration

| Option | Required | Description |
| --- | --- | --- |
| `type` | Yes | Must be `custom:smart-camera-switcher`. |
| `cameras` | Yes | List of camera objects with `id`, `entity`, and optional `name`. |
| `selector_entity` | No | An `input_select` used for manual camera selection. |
| `active_entity` | No | A sensor whose state matches one of the camera IDs. Useful for auto-follow behavior. |
| `title` | No | Card title. |
| `max_height` | No | Height of the main camera viewer, for example `25vh` or `320px`. |
| `camera_view` | No | Camera view mode. Defaults to `live`. |
| `fit_mode` | No | Camera fit mode. Defaults to `cover`. |
| `show_names` | No | Show labels over the circular camera buttons. Defaults to `false`. |

## Camera Selection Priority

Smart Camera Switcher chooses the visible camera in this order:

1. `selector_entity`, when it exists and its state is not `auto`. This is the manual override.
2. `active_entity`, when it exists and its state matches one of your camera IDs. This is useful for automatic camera selection.
3. The first item in `cameras`, when neither helper gives a valid camera ID.

So if you want a fallback default camera, put it first in the `cameras` list.

## Optional Helper

For manual selection, create an `input_select` whose options match your camera IDs.

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
    initial: auto
    icon: mdi:cctv
```

---

## Local Development

Copy the current development file into Home Assistant:

```bash
cp dist/smart-camera-switcher.js /config/www/smart-camera-switcher.js
```

Then add or update the Lovelace resource:

```yaml
url: /local/smart-camera-switcher.js
type: module
```

## Project Status

- Standalone JavaScript custom card
- HACS custom repository metadata included
- Tested in a live Home Assistant dashboard
- Visual editor and full build pipeline are not included yet
