import { MAP_DEMO_CONFIG, darkStyleJson } from "./config.js";
import { MAP_DEMO_DATA } from "./data.js";

export function createMapDemoApp(options = {}) {
    const config = options.config || MAP_DEMO_CONFIG;
    const data = options.data || MAP_DEMO_DATA;
    let droneContextMenuHandler = options.onDroneContextMenu || function () {};
    let selectionChangeHandler = options.onSelectionChange || function () {};
    let map;
    let groupButtons;
    const state = {
        selectedType: "",
        selectedId: "",
        trackMode: "live",
        liveTimer: null,
        replayGuide: null,
        replayTrail: null,
        replayMarker: null,
        replayDroneId: "",
        replayIndex: 0,
        popupPoint: null,
        popupWindow: null,
        layerVisibility: {
            drones: true,
            devices: true,
            liveTrails: true,
            blocks: false,
            grids: false,
            labels: false
        }
    };
    const overlayGroups = {
        drones: [],
        devices: [],
        liveTrails: [],
        blocks: [],
        grids: [],
        labels: []
    };
    const groupLayerMap = {
        point: ["drones", "devices"],
        line: ["liveTrails"],
        area: ["blocks", "grids"]
    };

    function toPoint(item) {
        return new BMap.Point(item.lng, item.lat);
    }

    function encodeSvg(svg) {
        return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg);
    }

    function formatCoord(value) {
        return Number(value).toFixed(5);
    }

    function getStatusClass(status) {
        return status === "执行中" ? "执行中" : status === "返航中" ? "返航中" : status;
    }

    function getCentroid(list) {
        let lng = 0;
        let lat = 0;
        for (let i = 0; i < list.length; i += 1) {
            lng += list[i].lng;
            lat += list[i].lat;
        }
        return new BMap.Point(lng / list.length, lat / list.length);
    }

    function createDroneIcon(color, emphasized) {
        const halo = emphasized
            ? '<circle cx="24" cy="24" r="15" fill="' + color + '" fill-opacity="0.14">' +
                '<animate attributeName="r" values="14;18;14" dur="1.8s" repeatCount="indefinite" />' +
                '<animate attributeName="fill-opacity" values="0.08;0.22;0.08" dur="1.8s" repeatCount="indefinite" />' +
              '</circle>' +
              '<circle cx="24" cy="24" r="17" fill="none" stroke="#ffffff" stroke-opacity="0.7" stroke-width="1.4">' +
                '<animate attributeName="r" values="16;19.5;16" dur="1.8s" repeatCount="indefinite" />' +
                '<animate attributeName="stroke-opacity" values="0.65;0.1;0.65" dur="1.8s" repeatCount="indefinite" />' +
              '</circle>'
            : '<circle cx="24" cy="24" r="10" fill="' + color + '" fill-opacity="0.22" stroke="' + color + '" stroke-width="2" />';
        const bodyScale = emphasized ? 1.03 : 1;
        const svg = "" +
            '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">' +
            halo +
            '<g transform="translate(24 24) scale(' + bodyScale + ') translate(-24 -24)">' +
            '<path d="M19 18h10l3 6-3 6H19l-3-6z" fill="' + color + '" />' +
            '<circle cx="14" cy="14" r="4" fill="#d8f5ff" stroke="' + color + '" stroke-width="2" />' +
            '<circle cx="34" cy="14" r="4" fill="#d8f5ff" stroke="' + color + '" stroke-width="2" />' +
            '<circle cx="14" cy="34" r="4" fill="#d8f5ff" stroke="' + color + '" stroke-width="2" />' +
            '<circle cx="34" cy="34" r="4" fill="#d8f5ff" stroke="' + color + '" stroke-width="2" />' +
            '<path d="M17 17L10 10M31 17l7-7M17 31l-7 7M31 31l7 7" stroke="' + color + '" stroke-width="2" stroke-linecap="round" />' +
            '</g>' +
            '</svg>';
        return new BMap.Icon(encodeSvg(svg), new BMap.Size(48, 48), { anchor: new BMap.Size(24, 24) });
    }

    function createReplayIcon(emphasized) {
        const halo = emphasized
            ? '<circle cx="21" cy="21" r="16" fill="#ffb84d" fill-opacity="0.12">' +
                '<animate attributeName="r" values="15;19;15" dur="1.8s" repeatCount="indefinite" />' +
                '<animate attributeName="fill-opacity" values="0.08;0.18;0.08" dur="1.8s" repeatCount="indefinite" />' +
              '</circle>' +
              '<circle cx="21" cy="21" r="18" fill="none" stroke="#fff4df" stroke-opacity="0.74" stroke-width="1.4">' +
                '<animate attributeName="r" values="17;20.5;17" dur="1.8s" repeatCount="indefinite" />' +
                '<animate attributeName="stroke-opacity" values="0.72;0.12;0.72" dur="1.8s" repeatCount="indefinite" />' +
              '</circle>'
            : '';
        const outerStroke = emphasized ? '#fff4df' : '#ffd18a';
        const innerStroke = emphasized ? '#ffffff' : '#fff2d8';
        const ringOpacity = emphasized ? '1' : '0.82';
        const svg = "" +
            '<svg xmlns="http://www.w3.org/2000/svg" width="42" height="42" viewBox="0 0 42 42">' +
            halo +
            '<circle cx="21" cy="21" r="13" fill="rgba(22,14,6,0.92)" stroke="' + outerStroke + '" stroke-width="3" />' +
            '<circle cx="21" cy="21" r="7" fill="#ffb84d" stroke="' + innerStroke + '" stroke-width="2" />' +
            '<circle cx="21" cy="21" r="18" fill="none" stroke="#ffb84d" stroke-opacity="' + ringOpacity + '" stroke-width="2" stroke-dasharray="5 4" />' +
            '</svg>';
        return new BMap.Icon(encodeSvg(svg), new BMap.Size(42, 42), { anchor: new BMap.Size(21, 21) });
    }

    function createDeviceIcon(color, text) {
        const svg = "" +
            '<svg xmlns="http://www.w3.org/2000/svg" width="42" height="52" viewBox="0 0 42 52">' +
            '<path d="M21 3c9.3 0 16 6.8 16 15.7 0 10.6-9.4 18.5-16 30.3-6.6-11.8-16-19.7-16-30.3C5 9.8 11.7 3 21 3z" fill="' + color + '" />' +
            '<circle cx="21" cy="19" r="9" fill="#ffffff" fill-opacity="0.92" />' +
            '<text x="21" y="23" font-size="9" font-family="Microsoft YaHei" text-anchor="middle" fill="#173055">' + text + '</text>' +
            '</svg>';
        return new BMap.Icon(encodeSvg(svg), new BMap.Size(42, 52), { anchor: new BMap.Size(21, 47) });
    }

    function registerOverlay(group, overlay) {
        overlayGroups[group].push(overlay);
        map.addOverlay(overlay);
    }

    function initMap() {
        map = new BMap.Map("map", { enableMapClick: false });
        map.centerAndZoom(new BMap.Point(config.center.lng, config.center.lat), config.zoom);
        map.setMapStyleV2({ styleJson: darkStyleJson });
        map.enableScrollWheelZoom(true);
        map.enableKeyboard(true);
        map.enableContinuousZoom(true);
        map.addControl(new BMap.NavigationControl({ anchor: BMAP_ANCHOR_BOTTOM_RIGHT }));
        map.addControl(new BMap.ScaleControl({ anchor: BMAP_ANCHOR_BOTTOM_RIGHT }));
    }

    function initDrones() {
        for (let i = 0; i < data.drones.length; i += 1) {
            const drone = data.drones[i];
            drone.routePoints = [];
            for (let j = 0; j < drone.route.length; j += 1) {
                drone.routePoints.push(toPoint(drone.route[j]));
            }
            drone.currentIndex = Math.min((i + 2) * 3, drone.routePoints.length - 1);
            drone.liveDirection = drone.currentIndex >= drone.routePoints.length - 1 ? -1 : 1;
            drone.liveTrailPoints = drone.routePoints.slice(0, drone.currentIndex + 1);
            drone.liveTrail = new BMap.Polyline(drone.liveTrailPoints, {
                strokeColor: "#4fa7ff",
                strokeWeight: 4,
                strokeOpacity: 0.42,
                strokeStyle: "solid"
            });
            registerOverlay("liveTrails", drone.liveTrail);
            drone.defaultIcon = createDroneIcon(drone.color, false);
            drone.activeIcon = createDroneIcon(drone.color, true);
            drone.marker = new BMap.Marker(drone.routePoints[drone.currentIndex], {
                icon: drone.defaultIcon,
                title: drone.name
            });
            drone.marker.addEventListener("click", createDroneClick(drone));
            drone.marker.addEventListener("rightclick", createDroneRightClick(drone));
            registerOverlay("drones", drone.marker);
        }
    }

    function initDevices() {
        for (let i = 0; i < data.devices.length; i += 1) {
            const device = data.devices[i];
            device.marker = new BMap.Marker(toPoint(device), {
                icon: createDeviceIcon(device.color, device.type.substring(0, 2)),
                title: device.name
            });
            device.marker.addEventListener("click", createDeviceClick(device));
            registerOverlay("devices", device.marker);
        }
    }

    function initBlocks() {
        for (let i = 0; i < data.airspaceBlocks.length; i += 1) {
            const block = data.airspaceBlocks[i];
            const polygonPoints = [];
            for (let j = 0; j < block.polygon.length; j += 1) {
                polygonPoints.push(toPoint(block.polygon[j]));
            }
            block.polygonPoints = polygonPoints;
            block.overlay = new BMap.Polygon(polygonPoints, {
                strokeColor: block.stroke,
                strokeWeight: 2,
                strokeOpacity: 0.95,
                fillColor: block.fill,
                fillOpacity: 0.18
            });
            block.overlay.addEventListener("click", createBlockClick(block));
            block.overlay.addEventListener("mouseover", createAreaHover(block.overlay, 0.26));
            block.overlay.addEventListener("mouseout", createAreaHover(block.overlay, 0.18));
            registerOverlay("blocks", block.overlay);
            block.label = new BMap.Label(block.name, {
                position: getCentroid(block.polygon),
                offset: new BMap.Size(-40, -10)
            });
            block.label.setStyle({
                color: "#ffffff",
                background: "rgba(8,18,33,0.76)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: "10px",
                padding: "5px 8px",
                fontSize: "12px",
                lineHeight: "1"
            });
            registerOverlay("labels", block.label);
        }
    }

    function initGrids() {
        for (let i = 0; i < data.airspaceGrids.length; i += 1) {
            const grid = data.airspaceGrids[i];
            const polygonPoints = [];
            for (let j = 0; j < grid.polygon.length; j += 1) {
                polygonPoints.push(toPoint(grid.polygon[j]));
            }
            grid.polygonPoints = polygonPoints;
            const fillOpacity = grid.level === "重点" ? 0.18 : grid.level === "高" ? 0.14 : 0.08;
            grid.overlay = new BMap.Polygon(polygonPoints, {
                strokeColor: grid.stroke,
                strokeWeight: 1,
                strokeOpacity: 0.55,
                fillColor: grid.fill,
                fillOpacity
            });
            grid.overlay.addEventListener("click", createGridClick(grid));
            grid.overlay.addEventListener("mouseover", createAreaHover(grid.overlay, Math.min(fillOpacity + 0.08, 0.26)));
            grid.overlay.addEventListener("mouseout", createAreaHover(grid.overlay, fillOpacity));
            registerOverlay("grids", grid.overlay);
            grid.label = new BMap.Label(grid.id, {
                position: getCentroid(grid.polygon),
                offset: new BMap.Size(-18, -8)
            });
            grid.label.setStyle({
                color: "#e2efff",
                background: "rgba(6,14,25,0.62)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: "8px",
                padding: "4px 6px",
                fontSize: "11px",
                lineHeight: "1"
            });
            registerOverlay("labels", grid.label);
        }
    }

    function createAreaHover(overlay, opacity) {
        return function () {
            overlay.setFillOpacity(opacity);
        };
    }

    function createDroneClick(drone) {
        return function () {
            selectDrone(drone.id, true, "live");
        };
    }

    function createDroneRightClick(drone) {
        return function () {
            selectDrone(drone.id, false, "live");
            closeMapPopup();
            droneContextMenuHandler(drone.id);
        };
    }

    function createDeviceClick(device) {
        return function () {
            selectDevice(device.id, true);
        };
    }

    function createBlockClick(block) {
        return function () {
            selectBlock(block.id, true);
        };
    }

    function createGridClick(grid) {
        return function () {
            selectGrid(grid.id, true);
        };
    }

    function createInfoWindow(html) {
        const popupHtml = '<div class="map-popup-content">' + html + "</div>";
        const closeIconUrl = encodeSvg('' +
            '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">' +
            '<path d="M7 7l10 10M17 7L7 17" stroke="#eaf3ff" stroke-width="1.9" stroke-linecap="round"/>' +
            '</svg>');
        const popupWindow = window.BMapLib && typeof BMapLib.InfoBox === "function"
            ? new BMapLib.InfoBox(map, popupHtml, {
                boxClass: "map-popup-card map-popup-box",
                closeIconUrl: closeIconUrl,
                closeIconMargin: "12px 12px 0 0",
                enableAutoPan: true,
                offset: new BMap.Size(0, 60)
            })
            : new BMap.InfoWindow(popupHtml, {
                width: 300,
                enableMessage: false,
                offset: new BMap.Size(0, -6)
            });

        popupWindow.addEventListener("close", function () {
            if (state.popupWindow === popupWindow) {
                hideDetailCard();
                state.popupPoint = null;
                state.popupWindow = null;
            }
        });
        return popupWindow;
    }

    function showMapPopup(popupWindow, point) {
        if (!popupWindow || !point) return;
        if (typeof popupWindow.open === "function") {
            popupWindow.open(point);
            return;
        }
        map.openInfoWindow(popupWindow, point);
    }

    function positionMapPopup() {
        if (!state.popupWindow || !state.popupPoint) return;
        if (typeof state.popupWindow.setPosition === "function") {
            state.popupWindow.setPosition(state.popupPoint);
            if (typeof state.popupWindow.redraw === "function") {
                state.popupWindow.redraw();
            }
            showMapPopup(state.popupWindow, state.popupPoint);
            return;
        }
        showMapPopup(state.popupWindow, state.popupPoint);
    }

    function closeMapPopup() {
        state.popupPoint = null;
        if (state.popupWindow) {
            const popupWindow = state.popupWindow;
            state.popupWindow = null;
            if (typeof popupWindow.close === "function") {
                popupWindow.close();
                return;
            }
            map.closeInfoWindow();
        }
    }

    function notifySelectionChange() {
        selectionChangeHandler({
            type: state.selectedType,
            id: state.selectedId,
            trackMode: state.trackMode,
            replayDroneId: state.replayDroneId
        });
    }

    function hideDetailCard() {
        document.getElementById("detailCard").classList.add("hidden");
        state.selectedType = "";
        state.selectedId = "";
        syncDroneSelectionVisual();
        notifySelectionChange();
    }

    function closeDetailCard() {
        hideDetailCard();
        closeMapPopup();
    }

    function openMapPopup(point, html) {
        closeMapPopup();
        state.popupPoint = point;
        state.popupWindow = createInfoWindow(html);
        showMapPopup(state.popupWindow, point);
    }

    function renderStats() {
        const html = "" +
            '<div class="stat-card"><div class="stat-label">无人机点位</div><div class="stat-value">' + data.drones.length + '</div></div>' +
            '<div class="stat-card"><div class="stat-label">监视设备</div><div class="stat-value">' + data.devices.length + '</div></div>' +
            '<div class="stat-card"><div class="stat-label">空域</div><div class="stat-value">' + data.airspaceBlocks.length + '</div></div>' +
            '<div class="stat-card"><div class="stat-label">空域网格</div><div class="stat-value">' + data.airspaceGrids.length + '</div></div>';
        document.getElementById("stats").innerHTML = html;
    }

    function setDetailCard(title, kicker, desc, rows) {
        const card = document.getElementById("detailCard");
        card.classList.remove("hidden");
        card.classList.remove("is-empty");
        document.getElementById("detailTitle").innerText = title;
        document.getElementById("detailKicker").innerText = kicker;
        document.getElementById("detailDesc").innerText = desc;
        let html = "";
        for (let i = 0; i < rows.length; i += 1) {
            html += '<div class="kv"><span>' + rows[i].label + '</span><strong>' + rows[i].value + '</strong></div>';
        }
        document.getElementById("detailGrid").innerHTML = html;
    }

    function setEmptyDetail() {
        document.getElementById("detailCard").classList.remove("hidden");
        document.getElementById("detailCard").classList.add("is-empty");
        document.getElementById("detailKicker").innerText = "请选择地图对象";
        document.getElementById("detailTitle").innerText = "点线面交互展示";
        document.getElementById("detailDesc").innerText = "点击无人机查看实时态势，历史轨迹播放。";
        document.getElementById("detailGrid").innerHTML = "";
        syncDroneSelectionVisual();
        notifySelectionChange();
    }

    function getDroneById(id) {
        for (let i = 0; i < data.drones.length; i += 1) {
            if (data.drones[i].id === id) return data.drones[i];
        }
        return data.drones[0];
    }

    function getDeviceById(id) {
        for (let i = 0; i < data.devices.length; i += 1) {
            if (data.devices[i].id === id) return data.devices[i];
        }
        return data.devices[0];
    }

    function getBlockById(id) {
        for (let i = 0; i < data.airspaceBlocks.length; i += 1) {
            if (data.airspaceBlocks[i].id === id) return data.airspaceBlocks[i];
        }
        return data.airspaceBlocks[0];
    }

    function getGridById(id) {
        for (let i = 0; i < data.airspaceGrids.length; i += 1) {
            if (data.airspaceGrids[i].id === id) return data.airspaceGrids[i];
        }
        return data.airspaceGrids[0];
    }

    function getDroneFrame(drone, index) {
        return drone.route[index == null ? drone.currentIndex : index];
    }

    function isReplayActiveForDrone(droneId) {
        return state.trackMode === "history" && state.replayDroneId === droneId;
    }

    function syncDroneMarkerVisibility() {
        for (let i = 0; i < data.drones.length; i += 1) {
            const drone = data.drones[i];
            const visible = state.layerVisibility.drones && !(state.trackMode === "history" && drone.id === state.replayDroneId);
            if (visible) {
                drone.marker.show();
            } else {
                drone.marker.hide();
            }
        }
    }

    function syncLiveTrailsVisibility() {
        for (let i = 0; i < data.drones.length; i += 1) {
            const drone = data.drones[i];
            const visible = state.layerVisibility.liveTrails && !(state.trackMode === "history" && drone.id === state.replayDroneId);
            if (visible) {
                drone.liveTrail.show();
            } else {
                drone.liveTrail.hide();
            }
        }
    }

    function updateMapTip() {
        const tip = document.querySelector(".map-tip");
        if (!tip) {
            return;
        }
        tip.innerText = state.trackMode === "history"
            ? "历史回放中：地图仍保持实时点位刷新，底部时间轴只控制历史回放点。"
            : "左击无人机查看实时态势，右击无人机打开历史轨迹回放。";
    }

    function setDroneDetail(drone, frameIndex, mode, openWindow) {
        const frame = getDroneFrame(drone, frameIndex);
        const isHistoryMode = mode === "history";
        const desc = isHistoryMode
            ? "历史轨迹模式：时间轴控制历史回放点。"
            : "实时轨迹模式：展示当前速度、高度与电量。";
        const rows = isHistoryMode
            ? [
                { label: "任务", value: drone.mission },
                { label: "轨迹模式", value: "历史回放" },
                { label: "回放时间", value: frame.time },
                { label: "速度", value: frame.speed + " m/s" },
                { label: "高度", value: frame.altitude + " m" },
                { label: "坐标", value: formatCoord(frame.lng) + "<br>" + formatCoord(frame.lat) }
            ]
            : [
                { label: "任务", value: drone.mission },
                { label: "状态", value: getStatusClass(drone.status) },
                { label: "速度", value: frame.speed + " m/s" },
                { label: "高度", value: frame.altitude + " m" },
                { label: "电量", value: drone.battery + "%" },
                { label: "坐标", value: formatCoord(frame.lng) + "<br>" + formatCoord(frame.lat) }
            ];
        setDetailCard(drone.name, drone.id + " · 无人机点位", desc, rows);
        if (openWindow) {
            const point = drone.routePoints[frameIndex];
            openMapPopup(point, "" +
                "<h4>" + drone.name + "</h4>" +
                "<p>编号：" + drone.id + " · 机型：" + drone.model + "</p>" +
                "<p>任务：" + drone.mission + "</p>" +
                (isHistoryMode
                    ? "<p>模式：历史回放 · 时间：" + frame.time + "</p><p>提示：拖动底部时间轴查看历史轨迹</p>"
                    : "<p>速度：" + frame.speed + "m/s · 高度：" + frame.altitude + "m · 电量：" + drone.battery + "%</p>"));
        }
    }

    function selectDrone(id, openWindow, mode) {
        const drone = getDroneById(id);
        const detailMode = mode || (isReplayActiveForDrone(id) ? "history" : "live");
        const frameIndex = detailMode === "history" ? state.replayIndex : drone.currentIndex;
        state.selectedType = "drone";
        state.selectedId = id;
        syncDroneSelectionVisual();
        setDroneDetail(drone, frameIndex, detailMode, openWindow);
        notifySelectionChange();
    }

    function selectDevice(id, openWindow) {
        const device = getDeviceById(id);
        state.selectedType = "device";
        state.selectedId = id;
        setDetailCard(device.name, device.id + " · 监视设备点位", "展示设备类型、覆盖范围与点位详情交互。", [
            { label: "设备类型", value: device.type },
            { label: "设备状态", value: device.status },
            { label: "覆盖范围", value: device.range },
            { label: "能力通道", value: device.channel },
            { label: "设备坐标", value: formatCoord(device.lng) + "<br>" + formatCoord(device.lat) },
            { label: "说明", value: device.desc }
        ]);
        syncDroneSelectionVisual();
        notifySelectionChange();
        if (openWindow) {
            openMapPopup(toPoint(device), "" +
                "<h4>" + device.name + "</h4>" +
                "<p>编号：" + device.id + " · 类型：" + device.type + "</p>" +
                "<p>状态：" + device.status + " · 覆盖范围：" + device.range + "</p>" +
                "<p>" + device.desc + "</p>");
        }
    }

    function selectBlock(id, openWindow) {
        const block = getBlockById(id);
        state.selectedType = "block";
        state.selectedId = id;
        setDetailCard(block.name, block.id + " · 空域", "展示不规则业务空域边界、高度层和区域说明。", [
            { label: "等级", value: block.level },
            { label: "高度下限", value: block.floor },
            { label: "高度上限", value: block.ceiling },
            { label: "空域边界", value: block.polygon.length + " 个顶点" },
            { label: "作用", value: "业务空域边界表达" },
            { label: "说明", value: block.desc }
        ]);
        syncDroneSelectionVisual();
        notifySelectionChange();
        if (openWindow) {
            openMapPopup(getCentroid(block.polygon), "" +
                "<h4>" + block.name + "</h4>" +
                "<p>编号：" + block.id + " · 等级：" + block.level + "</p>" +
                "<p>高度范围：" + block.floor + " - " + block.ceiling + "</p>" +
                "<p>" + block.desc + "</p>");
        }
    }

    function selectGrid(id, openWindow) {
        const grid = getGridById(id);
        state.selectedType = "grid";
        state.selectedId = id;
        setDetailCard(grid.name, grid.id + " · 空域网格", "展示规则化网格分区、风险等级和面图层交互。", [
            { label: "等级", value: grid.level },
            { label: "高度下限", value: grid.floor },
            { label: "高度上限", value: grid.ceiling },
            { label: "网格边界", value: grid.polygon.length + " 个顶点" },
            { label: "作用", value: "网格化风险表达" },
            { label: "说明", value: grid.desc }
        ]);
        syncDroneSelectionVisual();
        notifySelectionChange();
        if (openWindow) {
            openMapPopup(getCentroid(grid.polygon), "" +
                "<h4>" + grid.name + "</h4>" +
                "<p>编号：" + grid.id + " · 风险：" + grid.level + "</p>" +
                "<p>高度范围：" + grid.floor + " - " + grid.ceiling + "</p>" +
                "<p>" + grid.desc + "</p>");
        }
    }

    function syncDroneSelectionVisual() {
        const selectedDroneId = state.selectedType === "drone" ? state.selectedId : "";
        for (let i = 0; i < data.drones.length; i += 1) {
            const drone = data.drones[i];
            if (typeof drone.marker.setIcon === "function") {
                drone.marker.setIcon(selectedDroneId === drone.id ? drone.activeIcon : drone.defaultIcon);
            }
        }
        if (state.replayMarker && typeof state.replayMarker.setIcon === "function") {
            const replaySelected = state.trackMode === "history" && state.selectedType === "drone" && state.selectedId === state.replayDroneId;
            state.replayMarker.setIcon(createReplayIcon(replaySelected));
        }
    }

    function setLayerVisible(group, visible) {
        state.layerVisibility[group] = visible;
        const list = overlayGroups[group] || [];
        for (let i = 0; i < list.length; i += 1) {
            if (visible) {
                list[i].show();
            } else {
                list[i].hide();
            }
        }
        if (group === "drones") {
            syncDroneMarkerVisibility();
        }
        if (group === "liveTrails") {
            syncLiveTrailsVisibility();
        }
    }

    function updateGroupButtonState() {
        if (!groupButtons) return;
        for (let i = 0; i < groupButtons.length; i += 1) {
            const groupName = groupButtons[i].getAttribute("data-group-toggle");
            const layers = groupLayerMap[groupName] || [];
            let active = true;
            for (let j = 0; j < layers.length; j += 1) {
                if (!state.layerVisibility[layers[j]]) {
                    active = false;
                    break;
                }
            }
            groupButtons[i].classList.toggle("active", active);
        }
    }

    function updateLayerChipState(layerName, visible) {
        const button = document.querySelector('[data-layer-toggle="' + layerName + '"]');
        if (button) {
            button.classList.toggle("active", visible);
        }
    }

    function applyGroupToggle(groupName, visible) {
        const layers = groupLayerMap[groupName] || [];
        for (let i = 0; i < layers.length; i += 1) {
            setLayerVisible(layers[i], visible);
            updateLayerChipState(layers[i], visible);
        }
        updateGroupButtonState();
    }

    function bindLayerToggles() {
        const buttons = document.querySelectorAll("[data-layer-toggle]");
        for (let i = 0; i < buttons.length; i += 1) {
            buttons[i].onclick = function () {
                const layerName = this.getAttribute("data-layer-toggle");
                const nextVisible = !state.layerVisibility[layerName];
                setLayerVisible(layerName, nextVisible);
                this.classList.toggle("active", nextVisible);
                updateGroupButtonState();
            };
        }
    }

    function applyInitialLayerVisibility() {
        const layers = Object.keys(state.layerVisibility);
        for (let i = 0; i < layers.length; i += 1) {
            const layerName = layers[i];
            setLayerVisible(layerName, state.layerVisibility[layerName]);
            updateLayerChipState(layerName, state.layerVisibility[layerName]);
        }
        updateGroupButtonState();
    }

    function fitAll() {
        let all = [];
        for (let i = 0; i < data.drones.length; i += 1) {
            all = all.concat(data.drones[i].routePoints);
        }
        for (let j = 0; j < data.devices.length; j += 1) {
            all.push(toPoint(data.devices[j]));
        }
        for (let k = 0; k < data.airspaceBlocks.length; k += 1) {
            all = all.concat(data.airspaceBlocks[k].polygonPoints);
        }
        map.setViewport(all, { margins: [110, 340, 130, 90] });
    }

    function bindToolbar() {
        groupButtons = document.querySelectorAll("[data-group-toggle]");
        for (let i = 0; i < groupButtons.length; i += 1) {
            groupButtons[i].onclick = function () {
                const groupName = this.getAttribute("data-group-toggle");
                const layers = groupLayerMap[groupName] || [];
                let shouldOpen = false;
                for (let j = 0; j < layers.length; j += 1) {
                    if (!state.layerVisibility[layers[j]]) {
                        shouldOpen = true;
                        break;
                    }
                }
                applyGroupToggle(groupName, shouldOpen);
            };
        }
        document.getElementById("detailCloseBtn").onclick = closeDetailCard;
        const fitAllBtn = document.getElementById("fitAllBtn");
        if (fitAllBtn) {
            fitAllBtn.onclick = fitAll;
        }
        updateGroupButtonState();
    }

    function tickLive() {
        for (let i = 0; i < data.drones.length; i += 1) {
            const drone = data.drones[i];
            if (drone.routePoints.length > 1) {
                if (drone.currentIndex >= drone.routePoints.length - 1) {
                    drone.liveDirection = -1;
                } else if (drone.currentIndex <= 0) {
                    drone.liveDirection = 1;
                }
                drone.currentIndex += drone.liveDirection;
            }
            drone.marker.setPosition(drone.routePoints[drone.currentIndex]);
            drone.liveTrailPoints.push(drone.routePoints[drone.currentIndex]);
            drone.liveTrail.setPath(drone.liveTrailPoints);
            if (drone.status !== "待命") {
                drone.battery = Math.max(36, drone.battery - 1);
            }
        }
        syncLiveTrailsVisibility();
        renderStats();
        if (state.selectedType === "drone") {
            const historySelected = state.trackMode === "history" && state.selectedId === state.replayDroneId;
            if (!historySelected) {
                selectDrone(state.selectedId, false, "live");
                if (state.popupWindow) {
                    const selectedDrone = getDroneById(state.selectedId);
                    state.popupPoint = selectedDrone.routePoints[selectedDrone.currentIndex];
                    positionMapPopup();
                }
            }
        }
    }

    function startLive() {
        stopLive();
        state.liveTimer = setInterval(tickLive, config.liveTickMs);
    }

    function stopLive() {
        if (state.liveTimer) {
            clearInterval(state.liveTimer);
            state.liveTimer = null;
        }
    }

    function enterHistoryMode(droneId) {
        state.trackMode = "history";
        state.replayDroneId = droneId;
        state.replayIndex = 0;
        closeMapPopup();
        syncDroneMarkerVisibility();
        syncLiveTrailsVisibility();
        updateMapTip();
    }

    function exitHistoryMode() {
        const droneId = state.replayDroneId;
        state.trackMode = "live";
        state.replayDroneId = "";
        state.replayIndex = 0;
        syncDroneMarkerVisibility();
        syncLiveTrailsVisibility();
        updateMapTip();
        if (droneId && state.selectedType === "drone" && state.selectedId === droneId) {
            selectDrone(droneId, false, "live");
        }
    }

    function clearReplayVisual() {
        if (state.replayGuide) {
            map.removeOverlay(state.replayGuide);
            state.replayGuide = null;
        }
        if (state.replayTrail) {
            map.removeOverlay(state.replayTrail);
            state.replayTrail = null;
        }
        if (state.replayMarker) {
            map.removeOverlay(state.replayMarker);
            state.replayMarker = null;
        }
    }

    function prepareReplay(droneId) {
        const drone = getDroneById(droneId);
        clearReplayVisual();
        state.replayGuide = new BMap.Polyline(drone.routePoints, {
            strokeColor: "#f8fbff",
            strokeWeight: 4,
            strokeOpacity: 0.3,
            strokeStyle: "dashed"
        });
        state.replayTrail = new BMap.Polyline([drone.routePoints[0]], {
            strokeColor: "#ffb84d",
            strokeWeight: 7,
            strokeOpacity: 0.96,
            strokeStyle: "solid"
        });
        state.replayMarker = new BMap.Marker(drone.routePoints[0], {
            icon: createReplayIcon(),
            title: drone.name + " 历史回放点"
        });
        map.addOverlay(state.replayGuide);
        map.addOverlay(state.replayTrail);
        map.addOverlay(state.replayMarker);
        syncLiveTrailsVisibility();
        map.setViewport(drone.routePoints, { margins: [110, 320, 160, 100] });
        return updateReplayFrame(droneId, 0, false);
    }

    function updateReplayFrame(droneId, index, panToPoint) {
        const drone = getDroneById(droneId);
        const frame = getDroneFrame(drone, index);
        const currentPoint = drone.routePoints[index];
        state.replayIndex = index;
        state.replayTrail.setPath(drone.routePoints.slice(0, index + 1));
        state.replayMarker.setPosition(currentPoint);
        if (state.selectedType === "drone" && state.selectedId === droneId && state.trackMode === "history") {
            setDroneDetail(drone, index, "history", false);
            if (state.popupWindow) {
                state.popupPoint = currentPoint;
                positionMapPopup();
            }
        }
        if (panToPoint !== false) {
            const bounds = map.getBounds();
            const isPointVisible = bounds && typeof bounds.containsPoint === "function" ? bounds.containsPoint(currentPoint) : false;
            if (!isPointVisible) {
                map.panTo(currentPoint);
            }
        }
        return {
            droneId: drone.id,
            droneName: drone.name,
            startTime: drone.route[0].time,
            currentTime: frame.time,
            speed: frame.speed,
            altitude: frame.altitude,
            progress: Math.round((index / (drone.route.length - 1)) * 100)
        };
    }

    function init() {
        initMap();
        initBlocks();
        initGrids();
        initDrones();
        initDevices();
        renderStats();
        bindLayerToggles();
        bindToolbar();
        syncDroneMarkerVisibility();
        applyInitialLayerVisibility();
        setEmptyDetail();
        updateMapTip();
        startLive();
    }

    return {
        init,
        fitAll,
        getMap() {
            return map;
        },
        getDroneById,
        getDroneFrame(droneId, index) {
            return getDroneFrame(getDroneById(droneId), index);
        },
        prepareReplay,
        updateReplayFrame,
        clearReplayVisual,
        enterHistoryMode,
        exitHistoryMode,
        pauseLive: stopLive,
        resumeLive: startLive,
        selectDrone(id, openWindow = true, mode) {
            selectDrone(id, openWindow, mode);
        },
        setDroneContextMenuHandler(handler) {
            droneContextMenuHandler = handler || function () {};
        },
        setSelectionChangeHandler(handler) {
            selectionChangeHandler = handler || function () {};
        }
    };
}
