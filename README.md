# Smart Camera Switcher

<p align="center">
  <img src="./logo.svg" alt="Smart Camera Switcher logo" width="520">
</p>

Smart Camera Switcher is a Home Assistant Lovelace custom card that shows one main camera feed with circular camera selectors underneath it. The main view can follow an active-motion sensor automatically, and you can manually switch cameras by tapping a circle.

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

1. Download `smart-camera-switcher.js` from this repository.
2. Copy it to your Home Assistant `www` folder as:

   `/config/www/smart-camera-switcher.js`

3. Add it as a Lovelace resource:

```yaml
url: /local/smart-camera-switcher.js
type: module
```

4. Refresh your browser.

### Add it to a dashboard

1. Open the dashboard where you want the card.
2. Click the top-right three-dot menu.
3. Click **Edit dashboard**.
4. Click **Add card**.
5. Choose **Manual**.
6. Paste one of the YAML examples below.
7. Replace each camera `entity` with your own Home Assistant camera entity.
8. Change each camera `id` to a short stable name, such as `front_door` or `driveway`.
9. If you use `selector_entity`, create the helper shown in **Optional Helper** and make its options match your camera IDs.
10. If you use `active_entity`, replace `sensor.active_camera_example` with a sensor whose state matches one of your camera IDs.
11. Click **Save**.

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

Use `active_entity` when another sensor decides which camera should be shown, such as a template sensor that tracks the camera with the latest motion or person detection. If `selector_entity` is set to anything other than `auto`, manual selection from the circular buttons wins.

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
| `auto_option` | No | The selector option that means auto-follow mode. Defaults to `auto`. |
| `active_entity` | No | A sensor whose state matches one of the camera IDs. Useful for auto-follow behavior. |
| `default_camera` | No | Camera ID to show when no valid auto camera is active. Defaults to the first camera in `cameras`. |
| `title` | No | Card title. |
| `max_height` | No | Height of the main camera viewer, for example `25vh` or `320px`. |
| `camera_view` | No | Camera view mode. Defaults to `live`. |
| `thumbnail_camera_view` | No | Camera view mode for the circular selectors. Defaults to `live`. Set to `auto` if you want lighter still/auto previews. |
| `fit_mode` | No | Camera fit mode. Defaults to `cover`. |
| `show_names` | No | Show labels over the circular camera buttons. Defaults to `false`. |
| `manual_timeout_seconds` | No | Return the selector to auto mode after a manual camera tap. Defaults to `60`. Set to `0` if manual selection should stay until changed. |
| `min_auto_switch_seconds` | No | Seconds an auto-follow target must stay stable before switching, including switching back to `default_camera`. Defaults to `3`. Manual taps switch immediately. |

## Camera Selection Priority

Smart Camera Switcher chooses the visible camera in this order:

1. `selector_entity`, when it exists and its state is not `auto`. This is the manual override.
2. `active_entity`, when it exists and its state matches one of your camera IDs. This is useful for automatic camera selection.
3. `default_camera`, or the first item in `cameras`, when neither helper gives a valid camera ID.

So if you want a fallback default camera, set `default_camera` or put it first in the `cameras` list.

The card does not render an Auto button. Auto is the normal helper state behind the scenes; the visible circular buttons are only your configured cameras.

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
cp smart-camera-switcher.js /config/www/smart-camera-switcher.js
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
