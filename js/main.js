import { MAP_DEMO_CONFIG } from "./config.js";
import { MAP_DEMO_DATA } from "./data.js";
import { createMapDemoApp } from "./app.js";
import { createPlaybackController } from "./playback.js";

const app = createMapDemoApp({
    config: MAP_DEMO_CONFIG,
    data: MAP_DEMO_DATA
});

const playbackController = createPlaybackController(app, {
    config: MAP_DEMO_CONFIG
});

app.setDroneContextMenuHandler(function (droneId) {
    playbackController.open(droneId);
});

app.setSelectionChangeHandler(function (selection) {
    playbackController.handleSelectionChange(selection);
});

app.init();
