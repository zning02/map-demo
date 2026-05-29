import { MAP_DEMO_CONFIG } from "./config.js";

export function createPlaybackController(app, options = {}) {
    const config = options.config || MAP_DEMO_CONFIG;
    const state = {
        open: false,
        droneId: "",
        index: 0,
        speed: 1,
        timer: null,
        playing: false
    };
    const panel = document.getElementById("playbackPanel");
    const entryEl = document.getElementById("playbackEntry");
    const controlsEl = document.getElementById("playbackControls");
    const sliderWrapEl = document.getElementById("playbackSliderWrap");
    const metaEl = document.getElementById("playbackMeta");
    const titleEl = document.getElementById("playbackTitle");
    const summaryEl = document.getElementById("playbackSummary");
    const playbackSummaryEl = document.getElementById("playbackPlaybackSummary");
    const startTimeEl = document.getElementById("playbackStartTime");
    const currentTimeEl = document.getElementById("playbackCurrentTime");
    const progressEl = document.getElementById("playbackProgress");
    const sliderEl = document.getElementById("playbackSlider");
    const toggleBtn = document.getElementById("playbackToggleBtn");
    const resetBtn = document.getElementById("playbackResetBtn");
    const returnBtn = document.getElementById("playbackReturnBtn");
    const speedSelect = document.getElementById("playbackSpeedSelect");
    const openBtn = document.getElementById("playbackOpenBtn");

    function stopTimer() {
        if (state.timer) {
            clearInterval(state.timer);
            state.timer = null;
        }
    }

    function setPlayingStatus(playing) {
        state.playing = playing;
        toggleBtn.innerText = playing ? "暂停" : "播放";
    }

    function showPanel() {
        panel.classList.remove("hidden");
    }

    function hidePanel() {
        panel.classList.add("hidden");
    }

    function setExpanded(expanded) {
        entryEl.classList.toggle("hidden", expanded);
        controlsEl.classList.toggle("hidden", !expanded);
        sliderWrapEl.classList.toggle("hidden", !expanded);
        metaEl.classList.toggle("hidden", !expanded);
    }

    function resetMeta() {
        startTimeEl.innerText = "--:--:--";
        currentTimeEl.innerText = "--:--:--";
        progressEl.innerText = "0%";
        sliderEl.value = 0;
    }

    function renderIdle(droneId) {
        if (!droneId) {
            hidePanel();
            return;
        }
        const drone = app.getDroneById(droneId);
        state.droneId = drone.id;
        showPanel();
        setExpanded(false);
        titleEl.innerText = drone.name + " · 轨迹回放";
        playbackSummaryEl.innerText = "速度 -- m/s · 高度 -- m · 时间 --";
        resetMeta();
    }

    function renderFrame() {
        const drone = app.getDroneById(state.droneId);
        const frame = app.updateReplayFrame(state.droneId, state.index, true);
        titleEl.innerText = drone.name + " · 轨迹回放";
        playbackSummaryEl.innerText = "速度 " + frame.speed + " m/s · 高度 " + frame.altitude + " m · 当前时间 " + frame.currentTime;
        startTimeEl.innerText = frame.startTime;
        currentTimeEl.innerText = frame.currentTime;
        progressEl.innerText = frame.progress + "%";
        sliderEl.value = state.index;
    }

    function pause() {
        stopTimer();
        setPlayingStatus(false);
    }

    function finish() {
        pause();
        progressEl.innerText = "100%";
    }

    function play() {
        if (!state.open || !state.droneId) {
            return;
        }
        pause();
        setPlayingStatus(true);
        state.timer = setInterval(function () {
            const replayFrameCount = app.getReplayFrameCount(state.droneId);
            if (state.index >= replayFrameCount - 1) {
                finish();
                return;
            }
            state.index += 1;
            renderFrame();
        }, Math.max(180, config.replayBaseTickMs / state.speed));
    }

    function reset() {
        if (!state.open || !state.droneId) {
            return;
        }
        pause();
        state.index = 0;
        renderFrame();
    }

    function close(options = {}) {
        const nextDroneId = options.nextDroneId || (options.hidePanel ? "" : state.droneId);
        pause();
        app.clearReplayVisual();
        if (state.open) {
            app.exitHistoryMode();
        }
        state.open = false;
        state.index = 0;
        if (options.hidePanel) {
            state.droneId = "";
            hidePanel();
            return;
        }
        renderIdle(nextDroneId);
    }

    function open(droneId) {
        const drone = app.getDroneById(droneId);
        pause();
        app.clearReplayVisual();
        app.enterHistoryMode(drone.id);
        state.open = true;
        state.droneId = drone.id;
        state.index = 0;
        state.speed = Number(speedSelect.value);
        showPanel();
        setExpanded(true);
        summaryEl.innerText = "历史轨迹已展开，正在回放该无人机已记录的实时巡游轨迹，可在此处回放或返回实时。";
        sliderEl.max = Math.max(0, app.getReplayFrameCount(drone.id) - 1);
        app.prepareReplay(drone.id);
        app.selectDrone(drone.id, false, "history");
        renderFrame();
        setPlayingStatus(false);
    }

    function handleSelectionChange(selection) {
        if (!selection || selection.type !== "drone") {
            if (state.open) {
                close({ hidePanel: true });
            } else {
                state.droneId = "";
                hidePanel();
            }
            return;
        }
        if (state.open && selection.id !== state.droneId) {
            close({ nextDroneId: selection.id });
            return;
        }
        if (!state.open) {
            renderIdle(selection.id);
        }
    }

    toggleBtn.onclick = function () {
        if (!state.open) {
            return;
        }
        if (state.playing) {
            pause();
        } else {
            play();
        }
    };

    resetBtn.onclick = reset;
    returnBtn.onclick = function () {
        close();
    };
    openBtn.onclick = function () {
        if (state.droneId) {
            open(state.droneId);
        }
    };

    speedSelect.onchange = function () {
        state.speed = Number(this.value);
        if (state.playing) {
            play();
        }
    };

    sliderEl.oninput = function () {
        if (!state.open) {
            return;
        }
        state.index = Number(this.value);
        pause();
        renderFrame();
    };

    return {
        open,
        close,
        pause,
        handleSelectionChange,
        isOpen() {
            return state.open;
        }
    };
}
