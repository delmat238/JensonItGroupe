/* =========================================
   Inhalation Réseau : au clic sur le nez, des câbles
   se branchent dans les narines puis sont aspirés avec leurs paquets.
   ========================================= */
(() => {
    const card = document.querySelector('.nasal-core-card');
    const nose = card?.querySelector('.core-logo-wrapper');
    const noseImg = nose?.querySelector('img');
    if (!card || !nose || !noseImg) return;

    const SVG_NS = 'http://www.w3.org/2000/svg';
    const COLORS = ['#38bdf8', '#ec4899', '#818cf8', '#34d399'];
    const CABLE_COUNT = 8;
    const DRAW_MS = 900;
    const FLOW_MS = 2600;
    const SUCK_MS = 1300;
    const STAGGER_MS = 70;
    // Position des narines dans img/nez.png (676×369), en fractions de l'image
    const NOSTRILS = [
        { x: 292 / 676, y: 210 / 369, rx: 18 / 676, ry: 10 / 369 },
        { x: 395 / 676, y: 210 / 369, rx: 19 / 676, ry: 10 / 369 },
    ];
    const NOSTRIL_COLOR = '#4f2223';

    const statusTag = card.querySelector('.tag-bottom');
    const statusTitle = statusTag?.querySelector('strong');
    const statusText = statusTag?.querySelector('.tag-text span');
    const initialStatus = statusTag && [statusTitle.textContent, statusText.textContent];

    let running = false;
    let restoreTimer = null;

    const el = (name, attrs = {}) => {
        const node = document.createElementNS(SVG_NS, name);
        Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
        return node;
    };

    const clamp01 = (t) => Math.min(Math.max(t, 0), 1);
    const easeOut = (t) => 1 - Math.pow(1 - t, 3);
    const easeIn = (t) => t * t * t;

    function setStatus(title, text, active) {
        if (!statusTag) return;
        statusTitle.textContent = title;
        statusText.textContent = text;
        statusTag.classList.toggle('is-active', active);
    }

    // Narines en coordonnées de la carte, recalculées à chaque image car le nez respire
    function locateNostrils() {
        const cardRect = card.getBoundingClientRect();
        const rect = noseImg.getBoundingClientRect();
        const ratio = noseImg.naturalWidth / noseImg.naturalHeight || 676 / 369;
        let width = rect.width;
        let height = rect.height;
        if (width / height > ratio) width = height * ratio;
        else height = width / ratio;
        const left = rect.left - cardRect.left + (rect.width - width) / 2;
        const top = rect.top - cardRect.top + (rect.height - height) / 2;

        return NOSTRILS.map((n) => ({
            x: left + n.x * width,
            y: top + n.y * height,
            rx: n.rx * width,
            ry: n.ry * height,
        }));
    }

    function buildNostrils(defs, glowLayer, holeLayer) {
        const glow = el('radialGradient', { id: 'nostril-glow' });
        glow.append(
            el('stop', { offset: '0', 'stop-color': '#ec4899', 'stop-opacity': '0.9' }),
            el('stop', { offset: '0.45', 'stop-color': '#38bdf8', 'stop-opacity': '0.35' }),
            el('stop', { offset: '1', 'stop-color': '#38bdf8', 'stop-opacity': '0' }),
        );
        defs.append(glow);

        return NOSTRILS.map(() => {
            const halo = el('ellipse', { class: 'nostril-glow', fill: 'url(#nostril-glow)' });
            const hole = el('ellipse', { class: 'nostril-hole', fill: NOSTRIL_COLOR });
            glowLayer.append(halo);
            holeLayer.append(hole);
            return { halo, hole, pulse: 0 };
        });
    }

    function buildCables(defs, layer, size) {
        const center = size / 2;
        const startAngle = Math.random() * Math.PI * 2;
        const cables = [];

        for (let i = 0; i < CABLE_COUNT; i++) {
            const angle = startAngle + (i * 2 * Math.PI) / CABLE_COUNT + (Math.random() - 0.5) * 0.4;
            const radius = size * (0.75 + Math.random() * 0.2);
            const side = Math.cos(angle) < 0 ? -1 : 1;
            const start = { x: center + Math.cos(angle) * radius, y: center + Math.sin(angle) * radius };
            // Point de contournement à côté et sous le nez, pour remonter dans la narine par en dessous
            const detour = {
                x: center + side * size * (0.32 + Math.random() * 0.1),
                y: center + size * (0.12 + Math.random() * 0.08),
            };

            const color = COLORS[i % COLORS.length];
            const gradient = el('linearGradient', {
                id: `cable-grad-${i}`,
                gradientUnits: 'userSpaceOnUse',
                x1: start.x, y1: start.y,
            });
            gradient.append(
                el('stop', { offset: '0', 'stop-color': color, 'stop-opacity': '0.35' }),
                el('stop', { offset: '0.75', 'stop-color': color }),
                el('stop', { offset: '1', 'stop-color': '#ffffff' }),
            );
            defs.append(gradient);

            const group = el('g', { class: 'cable', style: `color: ${color}` });
            const sheath = el('path', { class: 'cable-sheath' });
            const core = el('path', { class: 'cable-core', stroke: `url(#cable-grad-${i})` });

            // Connecteur RJ45 stylisé à l'extrémité libre du câble
            const plug = el('g', { class: 'cable-plug' });
            plug.append(
                el('rect', { x: -8, y: -5, width: 12, height: 10, rx: 2 }),
                el('rect', { x: -5, y: -2.5, width: 5, height: 5, rx: 1, class: 'plug-contacts' }),
            );

            group.append(sheath, core, plug);
            layer.append(group);

            cables.push({
                index: i, color, side, start, detour, gradient, sheath, core, plug,
                nostril: side < 0 ? 0 : 1, total: 1, from: 0, to: 0,
            });
        }

        return cables;
    }

    function updateCable(cable, t, nostril, size) {
        const end = { x: nostril.x, y: nostril.y - nostril.ry * 0.2 };
        const entry = { x: end.x + cable.side * nostril.rx * 0.6, y: end.y + size * 0.13 };
        const d = `M${cable.start.x} ${cable.start.y} C${cable.detour.x} ${cable.detour.y} ${entry.x} ${entry.y} ${end.x} ${end.y}`;
        cable.sheath.setAttribute('d', d);
        cable.core.setAttribute('d', d);
        cable.gradient.setAttribute('x2', end.x);
        cable.gradient.setAttribute('y2', end.y);
        cable.total = cable.core.getTotalLength();

        const drawStart = cable.index * STAGGER_MS;
        const suckStart = DRAW_MS + FLOW_MS + cable.index * (STAGGER_MS * 0.8);
        const drawProgress = easeOut(clamp01((t - drawStart) / DRAW_MS));
        const suckProgress = easeIn(clamp01((t - suckStart) / SUCK_MS));

        cable.to = cable.total * drawProgress;
        cable.from = cable.total * suckProgress;

        // Segment visible [from, to] : le câble arrive de l'extérieur puis est avalé par la narine
        const dash = `${Math.max(cable.to - cable.from, 0)} ${cable.total * 2}`;
        [cable.sheath, cable.core].forEach((path) => {
            path.style.strokeDasharray = dash;
            path.style.strokeDashoffset = -cable.from;
        });

        const p = cable.core.getPointAtLength(cable.from);
        const ahead = cable.core.getPointAtLength(Math.min(cable.from + 1, cable.total));
        const angle = (Math.atan2(ahead.y - p.y, ahead.x - p.x) * 180) / Math.PI;
        const scale = 1 - suckProgress * 0.55;
        cable.plug.setAttribute('transform', `translate(${p.x} ${p.y}) rotate(${angle}) scale(${scale})`);
        cable.plug.style.opacity = drawProgress > 0 && suckProgress < 1 ? 1 : 0;

        return suckProgress;
    }

    function updateNostrils(overlays, nostrils, intensity, dt) {
        overlays.forEach((overlay, i) => {
            const n = nostrils[i];
            overlay.pulse = Math.max(overlay.pulse - dt / 350, 0);
            const strength = Math.min(intensity * 0.6 + overlay.pulse, 1);
            const grow = 2.2 + strength * 1.6;
            overlay.halo.setAttribute('cx', n.x);
            overlay.halo.setAttribute('cy', n.y + n.ry * 0.6);
            overlay.halo.setAttribute('rx', n.rx * grow);
            overlay.halo.setAttribute('ry', n.ry * grow * 1.3);
            overlay.halo.style.opacity = strength;
            // Recouvre l'extrémité des câbles pour qu'ils disparaissent dans le trou de la narine
            overlay.hole.setAttribute('cx', n.x);
            overlay.hole.setAttribute('cy', n.y);
            overlay.hole.setAttribute('rx', n.rx * 0.9);
            overlay.hole.setAttribute('ry', n.ry * 0.85);
        });
    }

    function inhale() {
        if (running) return;
        running = true;
        clearTimeout(restoreTimer);

        const size = card.clientWidth;
        const svg = el('svg', { class: 'network-cables', viewBox: `0 0 ${size} ${size}`, 'aria-hidden': 'true' });
        const defs = el('defs');
        const glowLayer = el('g');
        const cablesLayer = el('g');
        const packetsLayer = el('g');
        const holeLayer = el('g');
        svg.append(defs, glowLayer, cablesLayer, packetsLayer, holeLayer);
        card.insertBefore(svg, nose.nextSibling);
        card.classList.remove('inhale-complete');
        card.classList.add('is-inhaling');

        const overlays = buildNostrils(defs, glowLayer, holeLayer);
        const cables = buildCables(defs, cablesLayer, size);

        const packets = [];
        const endTime = DRAW_MS + FLOW_MS + SUCK_MS + CABLE_COUNT * STAGGER_MS;
        let absorbed = 0;
        let lastSpawn = 0;
        let lastFrame = performance.now();
        const start = lastFrame;

        setStatus('Aspiration Réseau', 'Connexion aux narines…', true);

        function frame(now) {
            const t = now - start;
            const dt = now - lastFrame;
            lastFrame = now;

            const nostrils = locateNostrils();
            let suction = 0;
            let connected = 0;
            cables.forEach((cable) => {
                suction = Math.max(suction, updateCable(cable, t, nostrils[cable.nostril], size));
                if (cable.to >= cable.total - 1) connected++;
            });

            // Émission de paquets sur les câbles déjà branchés
            if (t < endTime - SUCK_MS * 0.3 && now - lastSpawn > 55) {
                const ready = cables.filter((c) => c.to >= c.total - 1 && c.from < c.total - 20);
                if (ready.length) {
                    const cable = ready[Math.floor(Math.random() * ready.length)];
                    const r = 1.8 + Math.random() * 1.2;
                    const dot = el('circle', { r, class: 'packet', fill: cable.color, style: `color: ${cable.color}` });
                    packetsLayer.append(dot);
                    packets.push({ cable, dot, r, pos: cable.from / cable.total, speed: 0.18 + Math.random() * 0.2 });
                    lastSpawn = now;
                }
            }

            for (let i = packets.length - 1; i >= 0; i--) {
                const packet = packets[i];
                const { cable } = packet;
                const step = (packet.speed * (1 + suction * 3) * dt) / cable.total;
                packet.pos = Math.max(packet.pos + step, cable.from / cable.total);
                if (packet.pos >= 1) {
                    packet.dot.remove();
                    packets.splice(i, 1);
                    overlays[cable.nostril].pulse = 1;
                    absorbed += 8 + Math.floor(Math.random() * 24);
                    continue;
                }
                const length = packet.pos * cable.total;
                const p = cable.core.getPointAtLength(length);
                // Le paquet est étiré puis englouti en entrant dans la narine
                const remaining = cable.total - length;
                const shrink = clamp01(remaining / 14);
                packet.dot.setAttribute('cx', p.x);
                packet.dot.setAttribute('cy', p.y);
                packet.dot.setAttribute('r', packet.r * (0.4 + shrink * 0.6));
            }

            updateNostrils(overlays, nostrils, (connected / CABLE_COUNT) * (1 - suction * 0.3) + suction, dt);

            if (absorbed > 0) {
                setStatus('Aspiration Réseau', `${absorbed.toLocaleString('fr-FR')} paquets inhalés`, true);
            }

            if (t < endTime || packets.length) {
                requestAnimationFrame(frame);
            } else {
                finish(svg, absorbed);
            }
        }

        requestAnimationFrame(frame);
    }

    function finish(svg, absorbed) {
        svg.remove();
        card.classList.remove('is-inhaling');
        // Force le redémarrage de l'animation de flash
        void card.offsetWidth;
        card.classList.add('inhale-complete');
        setStatus('Réseau Inhalé', `${absorbed.toLocaleString('fr-FR')} paquets • 100% oxygéné`, true);
        running = false;

        restoreTimer = setTimeout(() => {
            card.classList.remove('inhale-complete');
            if (initialStatus) setStatus(...initialStatus, false);
        }, 2800);
    }

    nose.addEventListener('click', inhale);
    nose.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            inhale();
        }
    });
})();
