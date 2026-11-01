// quotes-appendix.js — v106.4
// "Forbehold"-bilag der renderes under tilbudsseddelen (og kommer med i print/PDF).
// Bruges af renderQuotePreview() i quotes-core.js via window.renderQuoteAppendix().
(function () {
    'use strict';

    const GOLD = '#a8873a';
    const BLACK = '#1a1a1a';

    // Inject styles once
    function ensureStyles() {
        if (document.getElementById('quoteAppendixStyles')) return;
        const st = document.createElement('style');
        st.id = 'quoteAppendixStyles';
        st.textContent = `
            .quote-sheet--bilag {
                background: #fff;
                margin-top: 40px;
                padding: 60px 55px;
                page-break-before: always;
                break-before: page;
            }
            .bilag-kicker {
                font-size: 11px; letter-spacing: 3px; text-transform: uppercase;
                color: ${GOLD}; font-weight: 700; margin: 0 0 6px 0;
            }
            .bilag-title {
                font-size: 22px; font-weight: 700; color: ${BLACK};
                margin: 0 0 4px 0; padding-bottom: 14px;
                border-bottom: 2px solid ${GOLD};
            }
            .bilag-sub { font-size: 11px; color: #666; margin: 8px 0 0 0; }
            .bilag-h { font-size: 12px; font-weight: 700; color: ${BLACK}; margin: 22px 0 8px 0; }
            .bilag-p { font-size: 11px; line-height: 1.65; color: #222; margin: 0 0 8px 0; }
            .bilag-ul { margin: 0 0 8px 0; padding-left: 18px; }
            .bilag-ul li { font-size: 11px; line-height: 1.65; color: #222; margin-bottom: 5px; }
            .bilag-table { width: 100%; border-collapse: collapse; margin: 10px 0 14px 0; }
            .bilag-table th {
                background: ${BLACK}; color: #fff; font-size: 11px; font-weight: 700;
                text-align: left; padding: 9px 12px;
            }
            .bilag-table td { font-size: 11px; color: #222; padding: 8px 12px; border-bottom: 1px solid #e5e0d5; }
            .bilag-table tr:nth-child(even) td { background: #faf8f3; }
            .bilag-note {
                border-left: 3px solid ${GOLD}; background: #faf8f3;
                padding: 10px 14px; font-size: 10.5px; color: #444; margin: 12px 0; line-height: 1.6;
            }
            .bilag-foot { font-size: 9.5px; color: #888; margin-top: 18px; font-style: italic; }
            .bilag-diagram { width: 100%; max-width: 640px; margin: 14px auto; display: block; border: 1px solid #e5e0d5; padding: 8px; box-sizing: border-box; }
            .bilag-pdfpages { margin: 6px 0 10px 0; }
            .bilag-pdf-canvas {
                width: 100%; height: auto; display: block;
                border: 1px solid #e5e0d5; margin: 10px 0; background: #fff;
                page-break-inside: avoid; break-inside: avoid;
            }
            .bilag-pdf-loading, .bilag-pdf-fallback { font-size: 10.5px; color: #888; padding: 10px 0; }
            .bilag-pdf-fallback a { color: ${GOLD}; font-weight: 600; }
            .bilag-list-row {
                display: flex; align-items: center; gap: 12px; padding: 12px 0;
                border-bottom: 1px solid #e5e0d5; font-size: 11px; color: #222;
            }
            .bilag-list-row a { color: ${GOLD}; font-weight: 600; text-decoration: none; }
            .bilag-num {
                min-width: 34px; height: 34px; border-radius: 50%;
                background: ${BLACK}; color: ${GOLD}; font-weight: 700; font-size: 12px;
                display: flex; align-items: center; justify-content: center; flex-shrink: 0;
            }
            @media print {
                .quote-sheet--bilag { margin-top: 0; padding: 10px 0; }
            }
        `;
        document.head.appendChild(st);
    }
    // ---- Bilag 1a: Handelsbetingelser, sektion 1-2 (råt indhold uden arkkanvas) ----
    function hbDel1() {
        return `
            <p class="bilag-kicker">Bilag 1</p>
            <h2 class="bilag-title">Handelsbetingelser — ved samarbejde med Seest Gulvteknik</h2>

            <h3 class="bilag-h">1. Generelt</h3>
            <p class="bilag-p">I forbindelse med fremsendte tilbud gør vi opmærksom på følgende:</p>
            <p class="bilag-p">Medmindre der udtrykkeligt er angivet afvigelser i tilbuddet, udføres arbejdet i henhold til de gældende retningslinjer og juridiske rammer fastlagt i AB 18.</p>

            <h3 class="bilag-h">2. Generelle forudsætninger for udførelse af gulvarbejde</h3>
            <p class="bilag-p">Som standard gælder det for epoxy- og polyuretangulve (Crete-/PU-beton undtaget), at fuld hærdestyrke først opnås efter 5–7 dage. I denne periode anbefales det at undgå gulvvask og hård belastning. Gulvet bør afdækkes i det omfang, den forventede belastning nødvendiggør det.</p>
            <p class="bilag-p">Tilbudspriser er ikke baseret på weekendarbejde, medmindre andet er aftalt. Eventuelle aftaler herom vil fremgå af tilbuddet.</p>
            <p class="bilag-p">Ved projekter, der udføres i flere faser, foretages løbende fakturering i henhold til AB 18.</p>
            <p class="bilag-p">Ved tilbud på over DKK 80.000 ekskl. moms kan der forekomme opstartsfakturering på 80 % af materialeomkostningerne beregnet ud fra leverandørens listepriser. I så fald skal beløbet være indbetalt på vores bankkonto senest dagen før projekt-/opgavestart. Se de nærmere vilkår i AB 18.</p>
            <p class="bilag-p">Der ydes to års garanti på gulvet i henhold til AB 18, for så vidt angår fejl ved produktet og udførelsen.</p>
            <p class="bilag-p">Der tages forbehold for nedfald i overflader, der endnu ikke er afhærdede. Vi anbefaler derfor, at kunden foretager en grundig rengøring, inden arbejdet påbegyndes.</p>
            <p class="bilag-p">Der tages forbehold for betondæk med plastfibre. Der kan forekomme meromkostninger til forarbejdning af underlaget, medmindre andet er aftalt på forhånd.</p>
            <p class="bilag-p">Der faktureres altid på baggrund af den endelige opmåling.</p>
            <p class="bilag-p">Ovenstående forudsætninger er standardvilkår og er ikke nødvendigvis alle gældende for det konkrete projekt. Hvis I ønsker at indgå et samarbejde med Seest Gulvteknik, bedes I kontakte undertegnede, så vilkårene kan afklares i forhold til den aktuelle opgave.</p>
        `;
    }

    // ---- Bilag 1b: Handelsbetingelser, sektion 3-4 (råt indhold) ----
    function hbDel2() {
        return `
            <h3 class="bilag-h">3. Krav og forudsætninger for samarbejdet</h3>
            <p class="bilag-p">Nedenstående punkter beskriver de væsentligste krav og forudsætninger for samarbejdet og det tilbudte arbejde. Punkterne gælder også for indgåede ordrer og aftaler.</p>
            <ul class="bilag-ul">
                <li>AB 92/AB 18-19 (Almindelige betingelser) er gældende for aftalen.</li>
                <li>Gulvet overtages i rengjort stand og skal være frit for affald.</li>
                <li>Vinduer og øvrige glaspartier, hvor solen kan stråle direkte ind, skal afdækkes senest dagen før arbejdets opstart. Dette er nødvendigt for at undgå for høje temperaturer på gulvet. Afdækningen udføres af bygherren, medmindre andet er aftalt skriftligt.</li>
                <li>Alt bevægeligt inventar skal være fjernet fra arbejdsområdet.</li>
                <li>Der skal være fri adgang til strøm svarende til 400 V, 32 A og 63 A CEE-stik. Da strømbehovet kan variere fra opgave til opgave, opfordres der til dialog med de projektansvarlige.</li>
                <li>Belysningen i rummet skal svare til den permanente belysning.</li>
                <li>Bygherren skal levere og afholde udgifterne til alle nødvendige forsyninger og alt forbrug i forbindelse med arbejdet, herunder el, vand og varme.</li>
                <li>Gulvet skal være tørt og forblive tørt samt uberørt fra arbejdets opstart og under hele arbejdsperioden.</li>
                <li>Gulvtemperaturen i rummet skal være minimum 14 °C og maksimum 22 °C.</li>
                <li>Bygherren stiller en affaldscontainer til rådighed, sørger for bortskaffelse af affald og afholder alle udgifter hertil.</li>
                <li>Temperaturen skal opretholdes under hele arbejdsprocessen. Gulvvarmen skal være slukket.</li>
                <li>Hvis SG Seest Gulvteknik ved ankomst til arbejdsstedet ikke kan få adgang til gulvarealet, faktureres et beløb på minimum DKK 2.500. Hertil kommer udgifter til kørsel. Den endelige afregning afhænger blandt andet af projektets adresse, opgavens størrelse og antallet af medarbejdere, der er mødt frem.</li>
                <li>Belægningen følger altid planheden i det eksisterende undergulv. Opretning af ujævnt fald, lunker og lignende er ikke indeholdt i tilbudssummen, medmindre dette tydeligt fremgår af tilbuddet. Sådanne arbejder faktureres særskilt.</li>
                <li>Der tages forbehold for bygningens konstruktion og beskaffenhed.</li>
                <li>Der tages forbehold for opstigende fugt, olie og lignende. Bemærk, at restfugt og opstigende fugt ikke er det samme.</li>
                <li>Ved ekstraarbejder udarbejdes en aftaleseddel med et overslag over ekstraarbejdets omfang og pris.</li>
                <li>Ekstraarbejde kan medføre yderligere udgifter, herunder eksempelvis overnatning, transport, udlæggerpenge samt overarbejde eller weekendarbejde.</li>
                <li>SG Seest Gulvteknik tager forbehold for ekstraomkostninger som følge af skjulte skader på undergulvet, eksempelvis skrukhed eller andre forhold, som med rimelighed ikke kunne konstateres ved SG Seest Gulvtekniks besigtigelse.</li>
                <li>Det forudsættes, at entreprenøren og dennes underentreprenører medtages som sikrede på den brand- og stormforsikring, som bygherren tegner i henhold til AB 92 § 8.</li>
                <li>Det forudsættes, at betongulvet har en restfugt på mindre end 4 vægtprocent og en aftræksstyrke på mindst 1,5 N/mm².</li>
                <li>Gulvbranchens Standardforbehold af maj 2008 for fugefrie gulve er gældende.</li>
            </ul>
            <h3 class="bilag-h">4. Timepriser for ekstraarbejde</h3>
            <p class="bilag-p">Timepriserne nedenfor er pr. medarbejder:</p>
            <table class="bilag-table">
                <tr><th>Arbejdstid</th><th>Timepris pr. medarbejder</th></tr>
                <tr><td>Hverdage</td><td>DKK 575,00</td></tr>
                <tr><td>Weekender, søn- og helligdage samt overarbejde</td><td>DKK 799,00</td></tr>
            </table>

            <p class="bilag-foot">SG Seest Gulvteknik ApS • CVR: 41435208 • www.seestgulvteknik.dk</p>
        `;
    }

    // Samlet Bilag 1: handelsbetingelser (alle sektioner i ét ark)
    function bilag1() {
        return '<div class="quote-sheet quote-sheet--bilag">' + hbDel1() + hbDel2() + '</div>';
    }
    // ---- Bilag 2: Planhed og tolerancer ----
    function bilag2() {
        return `
        <div class="quote-sheet quote-sheet--bilag">
            <p class="bilag-kicker">Bilag 2</p>
            <h2 class="bilag-title">Planhed og tolerancer</h2>
            <p class="bilag-sub">Gælder, hvis intet andet er aftalt skriftligt i tilbuddet.</p>

            <p class="bilag-p" style="margin-top: 16px;">Undergulvets planhed bedømmes med en 2 meters retlineal, enten som maksimal afstand fra linealen (lunker) eller som maksimal dybde af lokale ujævnheder (forhøjninger).</p>

            <table class="bilag-table">
                <tr><th>Gulvtype</th><th>Maks. afvigelse (mm)</th><th>Tolerance (%)</th></tr>
                <tr><td>Elastiske gulve</td><td>± 2 mm</td><td>± 0,6 %</td></tr>
                <tr><td>Tekstilbelægninger</td><td>± 3 mm</td><td>± 0,9 %</td></tr>
                <tr><td>Træ- og laminatgulve</td><td>± 2 mm</td><td>± 0,6 %</td></tr>
                <tr><td>Fugefrie gulve</td><td colspan="2">Følger underlagets planhed — belægningen er ikke selvudrettende</td></tr>
            </table>

            <div class="bilag-note">De angivne tolerancer gælder, hvis intet andet er aftalt. Planhedsmålinger foretages med 2 m retlineal, og arbejdet afregnes særskilt, hvis underlaget kræver opretning ud over tilbuddets omfang.</div>

            <img class="bilag-diagram" src="assets/forbehold/rethed-og-tolerancer.png" alt="Tolerancetabel: krav til planhed for belægningstyper">

            <p class="bilag-foot">Baggrund: Gulvbranchens Oplysnings-Kasser (GOK) — Planhed af gulve. Toleranceangivelserne følger gulvbranchens retningslinjer.</p>
        </div>`;
    }

    // ---- Bilag 3: GOK-dokumenterne indlejret som sider (renderes med pdf.js) ----
    var GOK_DOCS = [
        { title: 'Planhed af gulve', org: 'Gulvbranchens Oplysnings-Kasser (GOK)', file: 'assets/forbehold/ok-p_-planhed-af-gulve.pdf' },
        { title: 'Forventninger til fugefrie gulve', org: 'Gulvbranchens Oplysnings-Kasser (GOK)', file: 'assets/forbehold/forventninger til fugefrie gulve.pdf' }
    ];
    var PDFJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    var PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

    function bilag3() {
        return `
        <div class="quote-sheet quote-sheet--bilag">
            <p class="bilag-kicker">Bilag 3</p>
            <h2 class="bilag-title">Vedlagte dokumenter — Gulvbranchens vejledninger</h2>
            <p class="bilag-sub" style="margin-bottom: 14px;">Følgende vejledninger fra Gulvbranchens Oplysnings-Kasser er en del af tilbuddets grundlag og er indlejret i sin fulde længde nedenfor.</p>
            <div class="bilag-note">Gulvbranchens Standardforbehold af maj 2008 for fugefrie gulve er gældende for fugefrie gulvbelægninger, jf. Handelsbetingelserne (Bilag 1, punkt 3).</div>
            ${GOK_DOCS.map(function (d, i) {
                return `
            <h3 class="bilag-h" style="margin-top: 26px;">Dokument ${i + 1}: ${d.title} <span style="font-weight: 400; color: #888;">(${d.org})</span></h3>
            <div class="bilag-pdfpages" id="bilagPdfPages${i + 1}" data-file="${d.file}">
                <div class="bilag-pdf-loading">Indlæser dokumentet…</div>
            </div>`;
            }).join('')}
            <p class="bilag-foot">Dokumenterne kan altid fremsendes igen på anmodning — kontakt SG Seest Gulvteknik ApS.</p>
        </div>`;
    }

    // Render GOK-PDF'erne til <canvas> (kanves printes som almindeligt indhold)
    function renderPdfPagesInto(containerId, file) {
        var host = document.getElementById(containerId);
        if (!host) return;
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
        // Emnede URL'er (mellemrum i filnavne)
        var url = file.split('/').map(encodeURIComponent).join('/');
        window.pdfjsLib.getDocument(url).promise.then(function (pdf) {
            host.innerHTML = '';
            var pageNum;
            function next() {
                if (pageNum > pdf.numPages) return;
                var current = pageNum++;
                pdf.getPage(current).then(function (page) {
                    var scale = 1.6;
                    var vp = page.getViewport({ scale: scale });
                    var canvas = document.createElement('canvas');
                    canvas.className = 'bilag-pdf-canvas';
                    canvas.width = vp.width;
                    canvas.height = vp.height;
                    host.appendChild(canvas);
                    page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise.then(next);
                }).catch(function (e) { console.error('PDF-side:', e); });
            }
            pageNum = 1;
            next();
        }).catch(function (err) {
            console.error('Kunne ikke indlæse PDF (' + file + '):', err);
            // Fallback: dokumentliste med links
            host.innerHTML = '<div class="bilag-pdf-fallback">Vejledningen kunne ikke vises her — ' +
                '<a href="' + encodeURI(file) + '" target="_blank" rel="noopener">Åbn som PDF</a></div>';
        });
    }

    function loadPdfJs(cb) {
        if (window.pdfjsLib) { cb(); return; }
        var s = document.createElement('script');
        s.src = PDFJS_URL;
        s.onload = cb;
        s.onerror = function () {
            // pdf.js kunne ikke hentes: vis fallback-links i alle hosts
            GOK_DOCS.forEach(function (d, i) {
                var host = document.getElementById('bilagPdfPages' + (i + 1));
                if (host) host.innerHTML = '<div class="bilag-pdf-fallback">Vejledningen kunne ikke vises her — ' +
                    '<a href="' + encodeURI(d.file) + '" target="_blank" rel="noopener">Åbn som PDF</a></div>';
            });
        };
        document.head.appendChild(s);
    }

    // Kaldes efter HTML'en er sat ind i DOM'et
    function schedulePdfRender() {
        setTimeout(function () {
            var anyHost = document.getElementById('bilagPdfPages1');
            if (!anyHost) return; // ikke (længer) i DOM
            loadPdfJs(function () {
                GOK_DOCS.forEach(function (d, i) {
                    renderPdfPagesInto('bilagPdfPages' + (i + 1), d.file);
                });
            });
        }, 0);
    }

    // Public: HTML for alle bilag (kun tilbud – ikke ordrevisning)
    window.renderQuoteAppendix = function () {
        ensureStyles();
        schedulePdfRender(); // Bilag 3: render PDF-siderne naar HTML'en er i DOM
        return bilag1() + bilag2() + bilag3();
    };
})();
