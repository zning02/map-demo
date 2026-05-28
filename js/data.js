function pad(value) {
    return value < 10 ? "0" + value : String(value);
}

function formatTime(totalSeconds) {
    const daySeconds = 24 * 60 * 60;
    const normalizedSeconds = ((totalSeconds % daySeconds) + daySeconds) % daySeconds;
    const hour = Math.floor(normalizedSeconds / 3600);
    const minute = Math.floor((normalizedSeconds % 3600) / 60);
    const second = normalizedSeconds % 60;
    return pad(hour) + ":" + pad(minute) + ":" + pad(second);
}

function createRoute(points, startHour, startMinute, baseSpeed, baseAltitude) {
    const route = [];
    const segmentSteps = 3;
    const stepSeconds = 40;
    let totalSeconds = (startHour * 60 + startMinute) * 60;
    for (let i = 0; i < points.length - 1; i += 1) {
        const current = points[i];
        const next = points[i + 1];
        for (let step = 0; step < segmentSteps; step += 1) {
            const ratio = step / segmentSteps;
            const pointIndex = route.length;
            route.push({
                lng: Number((current[0] + (next[0] - current[0]) * ratio).toFixed(6)),
                lat: Number((current[1] + (next[1] - current[1]) * ratio).toFixed(6)),
                speed: Number((baseSpeed + ((pointIndex % 6) - 2.5) * 0.45).toFixed(1)),
                altitude: Math.round(baseAltitude + ((pointIndex % 7) - 3) * 4),
                time: formatTime(totalSeconds)
            });
            totalSeconds += stepSeconds;
        }
    }
    if (points.length) {
        const pointIndex = route.length;
        route.push({
            lng: Number(points[points.length - 1][0].toFixed(6)),
            lat: Number(points[points.length - 1][1].toFixed(6)),
            speed: Number((baseSpeed + ((pointIndex % 6) - 2.5) * 0.45).toFixed(1)),
            altitude: Math.round(baseAltitude + ((pointIndex % 7) - 3) * 4),
            time: formatTime(totalSeconds)
        });
    }
    return route;
}

function getPolygonBounds(polygon) {
    let minLng = polygon[0].lng;
    let maxLng = polygon[0].lng;
    let minLat = polygon[0].lat;
    let maxLat = polygon[0].lat;
    for (let i = 1; i < polygon.length; i += 1) {
        minLng = Math.min(minLng, polygon[i].lng);
        maxLng = Math.max(maxLng, polygon[i].lng);
        minLat = Math.min(minLat, polygon[i].lat);
        maxLat = Math.max(maxLat, polygon[i].lat);
    }
    return { minLng, maxLng, minLat, maxLat };
}

function isPointOnSegment(point, start, end) {
    const cross = (point.lat - start.lat) * (end.lng - start.lng) - (point.lng - start.lng) * (end.lat - start.lat);
    if (Math.abs(cross) > 1e-10) {
        return false;
    }
    const dot = (point.lng - start.lng) * (end.lng - start.lng) + (point.lat - start.lat) * (end.lat - start.lat);
    if (dot < 0) {
        return false;
    }
    const squaredLength = (end.lng - start.lng) * (end.lng - start.lng) + (end.lat - start.lat) * (end.lat - start.lat);
    return dot <= squaredLength;
}

function isPointInPolygon(point, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
        const current = polygon[i];
        const previous = polygon[j];
        if (isPointOnSegment(point, previous, current)) {
            return true;
        }
        const intersect = ((current.lat > point.lat) !== (previous.lat > point.lat)) &&
            (point.lng < ((previous.lng - current.lng) * (point.lat - current.lat)) / (previous.lat - current.lat) + current.lng);
        if (intersect) {
            inside = !inside;
        }
    }
    return inside;
}

function isSamePoint(pointA, pointB) {
    return Math.abs(pointA.lng - pointB.lng) < 1e-10 && Math.abs(pointA.lat - pointB.lat) < 1e-10;
}

function isPointInRect(point, bounds) {
    return point.lng >= bounds.minLng - 1e-10 &&
        point.lng <= bounds.maxLng + 1e-10 &&
        point.lat >= bounds.minLat - 1e-10 &&
        point.lat <= bounds.maxLat + 1e-10;
}

function getSegmentIntersection(startA, endA, startB, endB) {
    const denominator = (startA.lng - endA.lng) * (startB.lat - endB.lat) - (startA.lat - endA.lat) * (startB.lng - endB.lng);
    if (Math.abs(denominator) < 1e-10) {
        return null;
    }
    const determinantA = startA.lng * endA.lat - startA.lat * endA.lng;
    const determinantB = startB.lng * endB.lat - startB.lat * endB.lng;
    const lng = (determinantA * (startB.lng - endB.lng) - (startA.lng - endA.lng) * determinantB) / denominator;
    const lat = (determinantA * (startB.lat - endB.lat) - (startA.lat - endA.lat) * determinantB) / denominator;
    const point = { lng, lat };
    if (!isPointOnSegment(point, startA, endA) || !isPointOnSegment(point, startB, endB)) {
        return null;
    }
    return point;
}

function dedupePolygonPoints(points) {
    const uniquePoints = [];
    for (let i = 0; i < points.length; i += 1) {
        let exists = false;
        for (let j = 0; j < uniquePoints.length; j += 1) {
            if (isSamePoint(points[i], uniquePoints[j])) {
                exists = true;
                break;
            }
        }
        if (!exists) {
            uniquePoints.push(points[i]);
        }
    }
    return uniquePoints;
}

function sortPolygonPoints(points) {
    let centerLng = 0;
    let centerLat = 0;
    for (let i = 0; i < points.length; i += 1) {
        centerLng += points[i].lng;
        centerLat += points[i].lat;
    }
    centerLng /= points.length;
    centerLat /= points.length;
    return points.slice().sort(function (pointA, pointB) {
        const angleA = Math.atan2(pointA.lat - centerLat, pointA.lng - centerLng);
        const angleB = Math.atan2(pointB.lat - centerLat, pointB.lng - centerLng);
        return angleA - angleB;
    });
}

function getPolygonArea(polygon) {
    let area = 0;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
        area += polygon[j].lng * polygon[i].lat - polygon[i].lng * polygon[j].lat;
    }
    return Math.abs(area) / 2;
}

function createClippedGridPolygon(cellPolygon, airspacePolygon) {
    const cellBounds = getPolygonBounds(cellPolygon);
    const clippedPoints = [];
    for (let i = 0; i < cellPolygon.length; i += 1) {
        if (isPointInPolygon(cellPolygon[i], airspacePolygon)) {
            clippedPoints.push(cellPolygon[i]);
        }
    }
    for (let i = 0; i < airspacePolygon.length; i += 1) {
        if (isPointInRect(airspacePolygon[i], cellBounds)) {
            clippedPoints.push(airspacePolygon[i]);
        }
    }
    for (let i = 0; i < cellPolygon.length; i += 1) {
        const nextCellIndex = (i + 1) % cellPolygon.length;
        for (let j = 0; j < airspacePolygon.length; j += 1) {
            const nextAirspaceIndex = (j + 1) % airspacePolygon.length;
            const intersection = getSegmentIntersection(cellPolygon[i], cellPolygon[nextCellIndex], airspacePolygon[j], airspacePolygon[nextAirspaceIndex]);
            if (intersection) {
                clippedPoints.push(intersection);
            }
        }
    }
    const uniquePoints = dedupePolygonPoints(clippedPoints);
    if (uniquePoints.length < 3) {
        return null;
    }
    const sortedPoints = sortPolygonPoints(uniquePoints);
    if (getPolygonArea(sortedPoints) < 1e-10) {
        return null;
    }
    return sortedPoints;
}

function createWeightedSegments(min, max, weights) {
    const segments = [];
    let cursor = min;
    let totalWeight = 0;
    for (let i = 0; i < weights.length; i += 1) {
        totalWeight += weights[i];
    }
    for (let i = 0; i < weights.length; i += 1) {
        const isLast = i === weights.length - 1;
        const size = ((max - min) * weights[i]) / totalWeight;
        const nextCursor = isLast ? max : cursor + size;
        segments.push({ min: cursor, max: nextCursor });
        cursor = nextCursor;
    }
    return segments;
}

function getAirspaceGridPattern(airspaceIndex) {
    const patterns = [
        {
            rowWeights: [1.35, 0.85, 1.5, 0.9],
            colWeights: [0.8, 1.25, 0.75, 1.45, 0.95]
        },
        {
            rowWeights: [0.9, 1.45, 0.7, 1.2],
            colWeights: [1.4, 0.75, 1.15, 0.65, 1.35]
        }
    ];
    return patterns[airspaceIndex % patterns.length];
}

function createGridForAirspace(airspace, rows, cols, airspaceIndex) {
    const grids = [];
    const bounds = getPolygonBounds(airspace.polygon);
    const pattern = getAirspaceGridPattern(airspaceIndex);
    const rowWeights = pattern.rowWeights.slice(0, rows);
    const colWeights = pattern.colWeights.slice(0, cols);
    const latSegments = createWeightedSegments(bounds.minLat, bounds.maxLat, rowWeights);
    const lngSegments = createWeightedSegments(bounds.minLng, bounds.maxLng, colWeights);
    const levels = ["低", "中", "中", "高", "重点"];
    let gridIndex = 1;
    for (let r = 0; r < latSegments.length; r += 1) {
        for (let c = 0; c < lngSegments.length; c += 1) {
            const minLng = lngSegments[c].min;
            const maxLng = lngSegments[c].max;
            const minLat = latSegments[r].min;
            const maxLat = latSegments[r].max;
            const cellPolygon = [
                { lng: minLng, lat: maxLat },
                { lng: maxLng, lat: maxLat },
                { lng: maxLng, lat: minLat },
                { lng: minLng, lat: minLat }
            ];
            const polygon = createClippedGridPolygon(cellPolygon, airspace.polygon);
            if (!polygon) {
                continue;
            }
            const level = levels[(r + c + airspaceIndex) % levels.length];
            const color = level === "重点" ? "#ff5a76" : level === "高" ? "#ff9a62" : level === "中" ? "#ffd166" : "#30d6a1";
            grids.push({
                id: airspace.id + "-GRID-" + pad(gridIndex),
                name: airspace.name + "网格 " + gridIndex,
                level,
                floor: airspace.floor,
                ceiling: airspace.ceiling,
                fill: color,
                stroke: color,
                desc: "以" + airspace.name + "边界为准裁剪生成，并采用不等分网格表达不同区域尺度。",
                polygon
            });
            gridIndex += 1;
        }
    }
    return grids;
}

function createAirspaceGrids(airspaceBlocks) {
    let grids = [];
    for (let i = 0; i < airspaceBlocks.length; i += 1) {
        grids = grids.concat(createGridForAirspace(airspaceBlocks[i], 4, 5, i));
    }
    return grids;
}

export const MAP_DEMO_DATA = {
    drones: [
        {
            id: "UAV-01",
            name: "巡防一号",
            model: "M350 RTK",
            mission: "晋安区低空巡防",
            status: "执行中",
            battery: 86,
            payload: "云台相机",
            color: "#4fa7ff",
            route: createRoute([
                [119.345, 26.103],
                [119.351, 26.104],
                [119.358, 26.101],
                [119.364, 26.097],
                [119.370, 26.092],
                [119.369, 26.087],
                [119.363, 26.086],
                [119.356, 26.088],
                [119.350, 26.091],
                [119.346, 26.095],
                [119.344, 26.099],
                [119.343, 26.102]
            ], 14, 20, 12.4, 98)
        },
        {
            id: "UAV-04",
            name: "街巡四号",
            model: "M30",
            mission: "三坊七巷空域巡查",
            status: "执行中",
            battery: 79,
            payload: "云台相机 + 喊话器",
            color: "#58d5ff",
            route: createRoute([
                [119.2940, 26.0886],
                [119.2952, 26.0868],
                [119.2958, 26.0850],
                [119.2978, 26.0838],
                [119.3004, 26.0832],
                [119.3030, 26.0834],
                [119.3054, 26.0846],
                [119.3062, 26.0868],
                [119.3056, 26.0886],
                [119.3048, 26.0852],
                [119.3022, 26.0828],
                [119.2988, 26.0824],
                [119.2958, 26.0836],
                [119.2942, 26.0860]
            ], 14, 24, 9.8, 86)
        },
        {
            id: "UAV-05",
            name: "校巡五号",
            model: "Mavic 3E",
            mission: "农林大学仓山校区空域巡查",
            status: "执行中",
            battery: 83,
            payload: "变焦云台",
            color: "#7ee081",
            route: createRoute([
                [119.2410, 26.0864],
                [119.2434, 26.0878],
                [119.2468, 26.0886],
                [119.2502, 26.0884],
                [119.2532, 26.0874],
                [119.2550, 26.0858],
                [119.2552, 26.0842],
                [119.2538, 26.0832],
                [119.2512, 26.0834],
                [119.2480, 26.0846],
                [119.2448, 26.0850],
                [119.2422, 26.0844]
            ], 14, 26, 8.9, 78)
        },
        {
            id: "UAV-02",
            name: "巡防二号",
            model: "M30T",
            mission: "闽江南岸航迹巡检",
            status: "执行中",
            battery: 74,
            payload: "双光云台",
            color: "#4fa7ff",
            route: createRoute([
                [119.281, 26.058],
                [119.292, 26.060],
                [119.305, 26.059],
                [119.318, 26.057],
                [119.331, 26.054],
                [119.342, 26.050],
                [119.338, 26.047],
                [119.326, 26.045],
                [119.312, 26.046],
                [119.299, 26.048],
                [119.287, 26.051],
                [119.280, 26.055]
            ], 14, 28, 14.1, 116)
        }
    ],
    devices: [
        { id: "DEV-01", name: "鼓楼雷达站", type: "雷达", lng: 119.274, lat: 26.098, status: "在线", range: "8km", channel: "X 波段", desc: "负责鼓楼片区低空目标探测与速度估计。", color: "#4fa7ff" },
        { id: "DEV-02", name: "仓山光电塔", type: "光电", lng: 119.361, lat: 26.042, status: "在线", range: "5km", channel: "可见光/红外", desc: "用于闽江沿岸重点区域目标识别与跟踪。", color: "#9b7bff" },
        { id: "DEV-03", name: "闽侯射频哨兵", type: "射频", lng: 119.202, lat: 26.069, status: "告警", range: "6km", channel: "2.4G/5.8G", desc: "监测无人机遥控链路与图传链路。", color: "#ff9f43" },
        { id: "DEV-04", name: "台江指挥站", type: "指挥", lng: 119.314, lat: 26.075, status: "在线", range: "联动", channel: "融合研判", desc: "汇聚福州城区设备、空域与轨迹数据，生成态势结果。", color: "#ff6b6b" }
    ],
    airspaceBlocks: [
        {
            id: "AS-04",
            name: "三坊七巷保障空域",
            level: "重点保障",
            floor: "20m",
            ceiling: "120m",
            fill: "#6f61ff",
            stroke: "#9386ff",
            desc: "位于三坊七巷附近的保障空域，用于街区低空巡查与重点活动值守。",
            polygon: [
                { lng: 119.2898, lat: 26.0918 },
                { lng: 119.2936, lat: 26.0924 },
                { lng: 119.2968, lat: 26.0919 },
                { lng: 119.2971, lat: 26.0898 },
                { lng: 119.2974, lat: 26.0868 },
                { lng: 119.3018, lat: 26.0866 },
                { lng: 119.3056, lat: 26.0869 },
                { lng: 119.3059, lat: 26.0896 },
                { lng: 119.3064, lat: 26.0922 },
                { lng: 119.3098, lat: 26.0916 },
                { lng: 119.3122, lat: 26.0904 },
                { lng: 119.3126, lat: 26.0868 },
                { lng: 119.3118, lat: 26.0842 },
                { lng: 119.3120, lat: 26.0802 },
                { lng: 119.3088, lat: 26.0792 },
                { lng: 119.3046, lat: 26.0790 },
                { lng: 119.3008, lat: 26.0794 },
                { lng: 119.2968, lat: 26.0792 },
                { lng: 119.2926, lat: 26.0795 },
                { lng: 119.2896, lat: 26.0804 },
                { lng: 119.2892, lat: 26.0844 },
                { lng: 119.2899, lat: 26.0870 }
            ]
        },
        {
            id: "AS-05",
            name: "农林大学巡查空域",
            level: "校区巡查",
            floor: "20m",
            ceiling: "110m",
            fill: "#6f61ff",
            stroke: "#9386ff",
            desc: "位于福建农林大学仓山校区附近的巡查空域，用于校区周界巡查与教学演示。",
            polygon: [
                { lng: 119.2374, lat: 26.0886 },
                { lng: 119.2408, lat: 26.0904 },
                { lng: 119.2448, lat: 26.0916 },
                { lng: 119.2498, lat: 26.0918 },
                { lng: 119.2548, lat: 26.0908 },
                { lng: 119.2586, lat: 26.0888 },
                { lng: 119.2602, lat: 26.0860 },
                { lng: 119.2600, lat: 26.0828 },
                { lng: 119.2580, lat: 26.0806 },
                { lng: 119.2546, lat: 26.0798 },
                { lng: 119.2508, lat: 26.0806 },
                { lng: 119.2472, lat: 26.0820 },
                { lng: 119.2444, lat: 26.0824 },
                { lng: 119.2414, lat: 26.0818 },
                { lng: 119.2388, lat: 26.0804 },
                { lng: 119.2370, lat: 26.0820 },
                { lng: 119.2366, lat: 26.0848 }
            ]
        },
        {
            id: "AS-02",
            name: "仓山-台江作业空域",
            level: "受限作业",
            floor: "30m",
            ceiling: "150m",
            fill: "#6f61ff",
            stroke: "#9386ff",
            desc: "仓山-台江作业空域，用于编队演练和作业验证。",
            polygon: [
                { lng: 119.280, lat: 26.070 },
                { lng: 119.330, lat: 26.060 },
                { lng: 119.354, lat: 26.052 },
                { lng: 119.356, lat: 26.046 },
                { lng: 119.344, lat: 26.042 },
                { lng: 119.322, lat: 26.040 },
                { lng: 119.296, lat: 26.042 },
                { lng: 119.278, lat: 26.046 },
                { lng: 119.268, lat: 26.052 },
                { lng: 119.260, lat: 26.060 }
            ]
        },
        {
            id: "AS-03",
            name: "晋安区测试空域",
            level: "常态通航",
            floor: "20m",
            ceiling: "140m",
            fill: "#6f61ff",
            stroke: "#9386ff",
            desc: "晋安区测试空域，用于日常物流测试与航线验证。",
            polygon: [
                { lng: 119.340, lat: 26.110 },
                { lng: 119.352, lat: 26.108 },
                { lng: 119.360, lat: 26.104 },
                { lng: 119.366, lat: 26.098 },
                { lng: 119.376, lat: 26.092 },
                { lng: 119.378, lat: 26.086 },
                { lng: 119.372, lat: 26.082 },
                { lng: 119.362, lat: 26.084 },
                { lng: 119.354, lat: 26.088 },
                { lng: 119.348, lat: 26.092 },
                { lng: 119.344, lat: 26.096 },
                { lng: 119.338, lat: 26.100 }
            ]
        }
    ]
};

MAP_DEMO_DATA.airspaceGrids = createAirspaceGrids(MAP_DEMO_DATA.airspaceBlocks);
