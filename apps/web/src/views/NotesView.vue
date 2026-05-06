<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useDebounceFn } from '@vueuse/core';
import { ContinuumEditor } from '@continuum/editor';
import { api, type BacklinkEntry } from '@/api';
import type { AiSearchHit, Note, EntityKind, FolderNode, ContextMenuItem } from '@continuum/shared';
import NotesSidebar from '@/components/notes/NotesSidebar.vue';
import NoteEditorHeader from '@/components/notes/NoteEditorHeader.vue';
import NoteCreateModal from '@/components/notes/NoteCreateModal.vue';
import RightSidebar from '@/components/notes/RightSidebar.vue';
import EmptyEditor from '@/components/notes/EmptyEditor.vue';
import { FolderForm } from '@/components/folders';
import { UiConfirmModal, UiContextMenu, UiPromptModal, type ContextMenuItem as UiContextMenuItem } from '@/components/ui';
import { useAiHealth } from '@/composables/useAiHealth';
import { useFolders } from '@/composables/useFolders';

const route = useRoute();
const router = useRouter();
const { embeddingsAvailable } = useAiHealth();
const folders = useFolders();

type SearchMode = 'filter' | 'semantic';
type EditorMode = 'wysiwyg' | 'markdown';

// --- State ---
const notes = ref<Note[]>([]);
const selectedId = ref<string | null>(null);

const draftTitle = ref('');
const draftKind = ref<EntityKind>('note');
const draftContent = ref('');
const draftJson = ref<unknown>(null);
const draftTags = ref<string[]>([]);

const search = ref('');
const searchMode = ref<SearchMode>('filter');
const semanticHits = ref<AiSearchHit[]>([]);
const semanticBusy = ref(false);
const createNoteOpen = ref(false);
const createNoteBusy = ref(false);
const createNoteError = ref('');
const isDev = import.meta.env.DEV;
const seedNotesBusy = ref(false);
const seedNotesError = ref('');

interface SemanticSeedTemplate {
  key: string;
  title: string;
  kind: EntityKind;
  tags: readonly string[];
  body: readonly string[];
  links: readonly string[];
  searchHints: readonly string[];
}

interface SemanticSeedDraft {
  index: number;
  batchId: string;
  template: SemanticSeedTemplate;
  title: string;
  folderId: string | null;
}

const longTermSeedTemplates: readonly SemanticSeedTemplate[] = [
  {
    key: 'mira-valen',
    title: 'Mira Valen cartografa',
    kind: 'character',
    tags: ['archivio-vivo', 'cartografia', 'marea', 'inchieste'],
    body: [
      'Mira Valen aggiorna mappe costiere usando correnti, voci di porto e misure prese sui pontili dopo il tramonto. Tiene quaderni separati per canali sicuri, relitti mobili, fondali salati e rotte che cambiano dopo ogni mareggiata.',
      'Negli ultimi anni ha confrontato le mappe ufficiali con appunti rubati ai capitani. Le discrepanze piu ricorrenti puntano verso segnali di marea nera, contratti opachi e passaggi secondari sotto il vecchio faro.',
    ],
    links: ['cartografo-maree', 'bussola-correnti', 'gilda-bussole', 'processo-mappe-false'],
    searchHints: ['cartografa', 'mappe false', 'rotte costiere', 'marea'],
  },
  {
    key: 'orun-mastro',
    title: 'Orun il mediatore del porto',
    kind: 'character',
    tags: ['diplomazia', 'porto', 'sciopero', 'negoziati'],
    body: [
      'Orun risolve dispute tra equipaggi, scaricatori e doganieri con una pazienza quasi rituale. Conosce i turni dei battelli, i debiti nascosti e le parole giuste per far ripartire una trattativa prima che diventi rissa.',
      'Dopo lo sciopero dei battelli ha iniziato a conservare copie private di accordi, multe e promesse verbali. Le sue note sono preziose quando una fazione nega di aver preso parte a un blocco del molo.',
    ],
    links: ['mediatore-porto', 'sciopero-battelli', 'contratto-sette-banchine', 'consiglio-maree'],
    searchHints: ['mediatore', 'negoziazione', 'sciopero', 'porto'],
  },
  {
    key: 'selene-registri',
    title: 'Selene dei registri bassi',
    kind: 'character',
    tags: ['archivio', 'segreti', 'registri', 'custodi'],
    body: [
      'Selene cataloga documenti umidi nelle stanze sotto il municipio. Sa riconoscere una pagina riscritta dal colore della colla, dal ritmo delle cancellature e dal peso diverso della carta sotto le dita.',
      'Ha trovato rimandi ripetuti a sigilli sotto Eron e a voci dormienti nei margini di inventari senza valore apparente. Per prudenza conserva copie cifrate dentro fascicoli di manutenzione.',
    ],
    links: ['custodi-archivio-basso', 'sigilli-sotto-eron', 'archivio-voci-dormienti', 'archivista-campo'],
    searchHints: ['archivio basso', 'sigilli', 'registri alterati', 'documenti'],
  },
  {
    key: 'daro-chiuse',
    title: 'Daro delle chiuse',
    kind: 'character',
    tags: ['manutenzione', 'diga', 'chiuse', 'tecnico'],
    body: [
      'Daro conosce ogni bullone delle chiuse orientali. Segna vibrazioni, pressione dell acqua e colore della ruggine, poi confronta i dati con una memoria pratica costruita in venti inverni di guasti.',
      'Dopo l incendio della diga vecchia ha imposto turni di ispezione piu brevi. La sua lista di interventi distingue tra rischio reale, panico del consiglio e danni lasciati in silenzio per risparmiare fondi.',
    ],
    links: ['tecnico-chiuse', 'incendio-diga-vecchia', 'chiave-ruggine-dolce', 'checklist-riparazioni'],
    searchHints: ['chiuse', 'diga', 'ruggine', 'manutenzione'],
  },
  {
    key: 'nima-serra',
    title: 'Nima della serra salmastra',
    kind: 'character',
    tags: ['erbe', 'serra', 'cura', 'sale'],
    body: [
      'Nima coltiva piante capaci di vivere tra acqua dolce e acqua salata. I suoi appunti registrano odori, fioriture lente, reazioni a polveri minerali e rimedi preparati per febbri da molo.',
      'La serra e diventata un archivio parallelo: ogni vaso ha una storia, ogni talea una provenienza. Alcune specie reagiscono alla marea nera chiudendo le foglie molto prima che il fenomeno sia visibile.',
    ],
    links: ['erbario-nima', 'maree-nere', 'figli-sale', 'appunti-cucina-molo'],
    searchHints: ['serra salmastra', 'erbe medicinali', 'piante', 'marea nera'],
  },
  {
    key: 'talia-cartaccia',
    title: 'Talia Cartaccia',
    kind: 'character',
    tags: ['contrabbando', 'lanterne', 'testimone', 'inchiesta'],
    body: [
      'Talia raccoglie ricevute, biglietti bruciati e frammenti di timbri doganali. Dice che la carta racconta la verita quando le persone hanno gia deciso quale bugia usare.',
      'Ha collegato una serie di lampade a vetro freddo a consegne notturne e al processo delle mappe false. Le sue prove sono fragili ma indicano una rete piu ampia del semplice contrabbando.',
    ],
    links: ['lampada-vetro-freddo', 'officina-lanterne', 'processo-mappe-false', 'quartiere-lanterne'],
    searchHints: ['contrabbando', 'prove cartacee', 'lampade', 'inchiesta'],
  },
  {
    key: 'nacreani',
    title: 'Nacreani',
    kind: 'race',
    tags: ['popolo', 'nacre', 'lingua', 'osservatorio'],
    body: [
      'I Nacreani abitano terrazze chiare intorno all osservatorio e usano registri sonori per tramandare misure astronomiche. La loro scrittura alterna incisioni sottili e pause che indicano il respiro del lettore.',
      'Nelle traduzioni piu antiche non separano scienza, genealogia e preghiera. Una nota di rotta puo contenere anche un ricordo famigliare e una previsione sulle maree.',
    ],
    links: ['osservatorio-nacre', 'lingua-nacreana', 'spedizione-nacre', 'selene-registri'],
    searchHints: ['Nacreani', 'lingua', 'osservatorio', 'scrittura'],
  },
  {
    key: 'figli-sale',
    title: 'Figli del Sale',
    kind: 'race',
    tags: ['popolo', 'sale blu', 'miniera', 'adattamento'],
    body: [
      'I Figli del Sale lavorano vene minerali che colorano pelle, vestiti e strumenti con riflessi azzurri. Portano maschere leggere non per paura della polvere, ma per riconoscere il grado di purezza dal sapore dell aria.',
      'Molti vivono tra miniera e porto, dividendo l anno in stagioni di estrazione e stagioni di mercato. Le loro canzoni descrivono percorsi sotterranei meglio di molte mappe ufficiali.',
    ],
    links: ['miniera-sale-blu', 'compagnia-sale-blu', 'nima-serra', 'cronologia-luna-spezzata'],
    searchHints: ['sale blu', 'miniera', 'popolo minerario', 'maschere'],
  },
  {
    key: 'veyrani',
    title: 'Veyrani del bosco interno',
    kind: 'race',
    tags: ['popolo', 'bosco', 'rituali', 'memoria'],
    body: [
      'I Veyrani conservano memoria dei sentieri con nodi, semi e piccole pietre lucide. Ogni famiglia riconosce una parte del bosco come se fosse una stanza di casa, anche quando gli alberi cambiano forma dopo le piogge.',
      'Accolgono visitatori solo durante la festa delle braci chiare. In quei giorni le storie sui segni della Luna Spezzata vengono cantate senza strumenti, per non svegliare le voci dormienti.',
    ],
    links: ['bosco-veyra', 'festa-braci-chiare', 'archivio-voci-dormienti', 'cronologia-luna-spezzata'],
    searchHints: ['Veyrani', 'bosco', 'rituali', 'memoria orale'],
  },
  {
    key: 'cartografo-maree',
    title: 'Cartografo delle maree',
    kind: 'class',
    tags: ['professione', 'mappe', 'correnti', 'maree'],
    body: [
      'Il cartografo delle maree misura territori che non restano mai fermi. Deve leggere vento, schiuma, rumore delle catene e testimonianze dei barcaioli prima di tracciare una rotta utile.',
      'La formazione include geometria pratica, astronomia bassa, archiviazione delle varianti e uso di bussole sensibili alla corrente. Gli errori non sono accademici: una linea sbagliata puo affondare un carico.',
    ],
    links: ['mira-valen', 'bussola-correnti', 'gilda-bussole', 'porto-vetro'],
    searchHints: ['cartografo', 'correnti', 'mappe', 'marea'],
  },
  {
    key: 'mediatore-porto',
    title: 'Mediatore di porto',
    kind: 'class',
    tags: ['professione', 'negoziati', 'porto', 'accordi'],
    body: [
      'Il mediatore di porto e una figura ibrida: parte notaio, parte arbitro, parte memoria vivente. Lavora tra banchine, sale doganali e taverne dove gli accordi vengono spesso stretti prima di essere scritti.',
      'Un buon mediatore sa quando registrare una promessa, quando fingere di non averla sentita e quando chiamare testimoni. La neutralita vale solo se tutte le parti credono di poter perdere qualcosa.',
    ],
    links: ['orun-mastro', 'contratto-sette-banchine', 'sciopero-battelli', 'consiglio-maree'],
    searchHints: ['mediatore', 'accordi', 'dogana', 'negoziato'],
  },
  {
    key: 'archivista-campo',
    title: 'Archivista di campo',
    kind: 'class',
    tags: ['professione', 'archivio', 'rilievi', 'fonti'],
    body: [
      'L archivista di campo porta il metodo fuori dalle sale ordinate. Raccoglie testimonianze in luoghi sporchi, conserva campioni, assegna indici provvisori e annota cosa potrebbe diventare prova in seguito.',
      'Questa classe nasce dopo il processo delle mappe false, quando divenne chiaro che una fonte non verificata poteva cambiare una sentenza. Ogni appunto deve indicare provenienza, ora e grado di fiducia.',
    ],
    links: ['selene-registri', 'processo-mappe-false', 'custodi-archivio-basso', 'frammento-senza-provenienza'],
    searchHints: ['archivista', 'prove', 'fonti', 'catalogazione'],
  },
  {
    key: 'tecnico-chiuse',
    title: 'Tecnico delle chiuse',
    kind: 'class',
    tags: ['professione', 'ingegneria', 'diga', 'manutenzione'],
    body: [
      'Il tecnico delle chiuse mantiene il confine tra citta e acqua. Lavora con pressioni, valvole, legno gonfio, ruggine e squadre stanche che devono fidarsi di istruzioni brevi durante una piena.',
      'La formazione richiede apprendistato sul campo e lettura di registri di guasto. Dopo ogni inverno il tecnico aggiorna procedure, strumenti e percorsi di evacuazione.',
    ],
    links: ['daro-chiuse', 'incendio-diga-vecchia', 'chiave-ruggine-dolce', 'checklist-riparazioni'],
    searchHints: ['tecnico', 'chiuse', 'diga', 'manutenzione'],
  },
  {
    key: 'porto-vetro',
    title: 'Porto di Vetro',
    kind: 'location',
    tags: ['luogo', 'porto', 'commercio', 'maree'],
    body: [
      'Il Porto di Vetro prende nome dai frangiflutti lucidi che riflettono le luci delle navi. Di giorno sembra ordinato, ma di notte le banchine si dividono in territori non dichiarati.',
      'Qui arrivano sale blu, strumenti di Nacre, piante salmastre e contratti con clausole scritte in margine. La ricerca semantica dovrebbe collegare il porto a mediazione, scioperi, mappe e commercio.',
    ],
    links: ['orun-mastro', 'sciopero-battelli', 'contratto-sette-banchine', 'diario-mercato'],
    searchHints: ['porto', 'banchine', 'commercio', 'sciopero'],
  },
  {
    key: 'bosco-veyra',
    title: 'Bosco di Veyra',
    kind: 'location',
    tags: ['luogo', 'bosco', 'rituale', 'sentieri'],
    body: [
      'Il Bosco di Veyra e difficile da mappare perche i sentieri cambiano dopo piogge lunghe e perche gli abitanti rimuovono segnali estranei. Le radure usate nei rituali non sono segnate su carte pubbliche.',
      'Chi entra senza guida torna con racconti incoerenti: alberi che sembrano ripetersi, luci basse, cenere fredda tra le radici. I Veyrani distinguono paura, memoria e cattivo orientamento con molta precisione.',
    ],
    links: ['veyrani', 'festa-braci-chiare', 'cronologia-luna-spezzata', 'registro-sogni'],
    searchHints: ['bosco', 'Veyra', 'sentieri', 'rituali'],
  },
  {
    key: 'miniera-sale-blu',
    title: 'Miniera del Sale Blu',
    kind: 'location',
    tags: ['luogo', 'miniera', 'sale blu', 'estrazione'],
    body: [
      'La Miniera del Sale Blu scende in camere umide dove la luce diventa lattiginosa. I turni sono brevi, i canti sono obbligatori e ogni silenzio improvviso viene trattato come segnale di crollo.',
      'La compagnia controlla pesi, accessi e registri medici. Alcune gallerie abbandonate portano simboli simili ai sigilli sotto Eron, ma nessuno li nomina durante le ispezioni ufficiali.',
    ],
    links: ['figli-sale', 'compagnia-sale-blu', 'sigilli-sotto-eron', 'nima-serra'],
    searchHints: ['sale blu', 'miniera', 'estrazione', 'sigilli'],
  },
  {
    key: 'osservatorio-nacre',
    title: 'Osservatorio di Nacre',
    kind: 'location',
    tags: ['luogo', 'astronomia', 'nacre', 'maree'],
    body: [
      'L Osservatorio di Nacre e costruito su terrazze che raccolgono vento e sale. Le sale superiori leggono il cielo, quelle inferiori archiviano maree e genealogie in registri sonori.',
      'La spedizione piu recente ha trovato strumenti allineati con la Luna Spezzata. Alcuni valori anticipano maree nere e anomalie nelle bussole costiere.',
    ],
    links: ['nacreani', 'spedizione-nacre', 'lingua-nacreana', 'maree-nere'],
    searchHints: ['osservatorio', 'Nacre', 'astronomia', 'marea nera'],
  },
  {
    key: 'quartiere-lanterne',
    title: 'Quartiere delle Lanterne',
    kind: 'location',
    tags: ['luogo', 'lanterne', 'artigiani', 'contrabbando'],
    body: [
      'Il Quartiere delle Lanterne ospita officine, botteghe e cortili stretti dove il vetro viene raffreddato con acqua salata. Di sera le insegne colorate rendono quasi impossibile seguire qualcuno.',
      'Da mesi circolano lampade a vetro freddo fuori registro. Alcuni pezzi finiscono nei carichi del porto prima di passare per la dogana, segno di un accordo interno.',
    ],
    links: ['officina-lanterne', 'lampada-vetro-freddo', 'talia-cartaccia', 'porto-vetro'],
    searchHints: ['lanterne', 'officine', 'contrabbando', 'vetro freddo'],
  },
  {
    key: 'bussola-correnti',
    title: 'Bussola delle Correnti',
    kind: 'item',
    tags: ['oggetto', 'bussola', 'mappe', 'marea'],
    body: [
      'La Bussola delle Correnti non punta il nord, ma la trazione dell acqua sotto la chiglia. Il quadrante vibra quando incontra sale blu raffinato o quando la marea nera si avvicina alle foci.',
      'Mira Valen la usa con cautela perche una lettura isolata puo mentire. Serve confrontarla con stelle basse, rumore dei cavi e memoria dei battellieri.',
    ],
    links: ['mira-valen', 'cartografo-maree', 'maree-nere', 'gilda-bussole'],
    searchHints: ['bussola', 'correnti', 'marea', 'mappe'],
  },
  {
    key: 'lampada-vetro-freddo',
    title: 'Lampada a Vetro Freddo',
    kind: 'item',
    tags: ['oggetto', 'lampada', 'vetro', 'contrabbando'],
    body: [
      'La lampada a vetro freddo emette luce stabile senza scaldare il metallo. Gli artigiani dicono che serve per archivi umidi, ma i contrabbandieri la preferiscono per leggere sigilli senza consumare ossigeno.',
      'I modelli recenti portano incisioni minuscole dietro il perno. Talia sostiene che quelle incisioni coincidano con consegne annotate solo su ricevute bruciate.',
    ],
    links: ['talia-cartaccia', 'officina-lanterne', 'quartiere-lanterne', 'sigilli-sotto-eron'],
    searchHints: ['lampada', 'vetro freddo', 'contrabbando', 'sigilli'],
  },
  {
    key: 'chiave-ruggine-dolce',
    title: 'Chiave di Ruggine Dolce',
    kind: 'item',
    tags: ['oggetto', 'chiave', 'diga', 'ruggine'],
    body: [
      'La chiave di ruggine dolce apre i pannelli piu vecchi delle chiuse. Il nome viene dall odore metallico lasciato sulle mani quando la lega reagisce con acqua salmastra.',
      'Daro la conserva in una scatola cerata e la usa solo in emergenza. Dopo l incendio della diga vecchia e diventata prova materiale in una disputa sulle responsabilita tecniche.',
    ],
    links: ['daro-chiuse', 'tecnico-chiuse', 'incendio-diga-vecchia', 'checklist-riparazioni'],
    searchHints: ['chiave', 'ruggine', 'chiuse', 'diga'],
  },
  {
    key: 'erbario-nima',
    title: 'Erbario di Nima',
    kind: 'item',
    tags: ['oggetto', 'erbario', 'piante', 'cura'],
    body: [
      'L Erbario di Nima contiene foglie pressate, semi salati, ricette di infusi e note sulle reazioni a minerali blu. Ogni pagina ha una scala di odore e una piccola mappa del luogo di raccolta.',
      'Alcune piante sembrano ricordare eventi di marea. Se raccolte dopo una notte nera, rilasciano colore scuro anche settimane piu tardi.',
    ],
    links: ['nima-serra', 'maree-nere', 'figli-sale', 'appunti-cucina-molo'],
    searchHints: ['erbario', 'piante', 'cura', 'marea nera'],
  },
  {
    key: 'contratto-sette-banchine',
    title: 'Contratto delle Sette Banchine',
    kind: 'item',
    tags: ['documento', 'contratto', 'porto', 'accordi'],
    body: [
      'Il contratto regola turni, pedaggi e precedenze tra sette banchine del Porto di Vetro. Le clausole laterali sono piu importanti del testo principale e cambiano valore a seconda della stagione.',
      'Orun ne conserva una copia annotata con firme, cancellature e promesse verbali. Durante lo sciopero dei battelli ogni fazione ha citato una versione diversa dello stesso documento.',
    ],
    links: ['orun-mastro', 'sciopero-battelli', 'consiglio-maree', 'porto-vetro'],
    searchHints: ['contratto', 'banchine', 'porto', 'sciopero'],
  },
  {
    key: 'gilda-bussole',
    title: 'Gilda delle Bussole',
    kind: 'faction',
    tags: ['fazione', 'cartografia', 'rotte', 'strumenti'],
    body: [
      'La Gilda delle Bussole certifica strumenti, rotte e cartografi. Ufficialmente protegge la navigazione, ma controlla anche quali mappe possono diventare documenti pubblici.',
      'Dopo il processo delle mappe false la gilda ha perso autorita e ha iniziato a finanziare rilievi privati. Mira Valen collabora con loro solo quando puo controllare i dati grezzi.',
    ],
    links: ['mira-valen', 'cartografo-maree', 'bussola-correnti', 'processo-mappe-false'],
    searchHints: ['gilda', 'bussole', 'cartografia', 'mappe false'],
  },
  {
    key: 'compagnia-sale-blu',
    title: 'Compagnia del Sale Blu',
    kind: 'faction',
    tags: ['fazione', 'miniera', 'commercio', 'sale blu'],
    body: [
      'La Compagnia del Sale Blu possiede carrelli, magazzini, medici e quasi tutti i debiti dei minatori. Il suo potere nasce dal controllo delle bilance prima ancora che dalla proprieta delle gallerie.',
      'Quando una vena cambia colore, la compagnia chiude il tratto e sposta i registri. Selene sospetta che i dati sanitari vengano riscritti prima di arrivare agli archivi pubblici.',
    ],
    links: ['miniera-sale-blu', 'figli-sale', 'selene-registri', 'diario-mercato'],
    searchHints: ['compagnia', 'sale blu', 'minatori', 'registri sanitari'],
  },
  {
    key: 'consiglio-maree',
    title: 'Consiglio delle Maree',
    kind: 'faction',
    tags: ['fazione', 'governo', 'porto', 'maree'],
    body: [
      'Il Consiglio delle Maree decide aperture delle chiuse, tariffe portuali e priorita dei soccorsi. Ogni membro rappresenta un equilibrio tra quartieri, compagnie e vecchie famiglie del litorale.',
      'Le decisioni piu delicate vengono motivate con grafici sulla sicurezza, ma spesso nascondono pressioni di banchina. Orun conosce le frasi usate quando il consiglio vuole sembrare neutrale.',
    ],
    links: ['orun-mastro', 'contratto-sette-banchine', 'incendio-diga-vecchia', 'sciopero-battelli'],
    searchHints: ['consiglio', 'maree', 'governo', 'tariffe'],
  },
  {
    key: 'custodi-archivio-basso',
    title: 'Custodi dell Archivio Basso',
    kind: 'faction',
    tags: ['fazione', 'archivio', 'custodi', 'segreti'],
    body: [
      'I Custodi dell Archivio Basso proteggono registri danneggiati, documenti scomodi e collezioni che nessun ufficio vuole nominare. L umidita e parte del sistema: rallenta furti e scoraggia curiosi.',
      'La fazione non e militare, ma possiede una disciplina feroce. Ogni custode impara a riconoscere falsi, muffe e mani che hanno paura di lasciare tracce.',
    ],
    links: ['selene-registri', 'archivista-campo', 'archivio-voci-dormienti', 'sigilli-sotto-eron'],
    searchHints: ['custodi', 'archivio basso', 'falsi', 'registri'],
  },
  {
    key: 'officina-lanterne',
    title: 'Officina delle Lanterne',
    kind: 'faction',
    tags: ['fazione', 'artigiani', 'vetro', 'lanterne'],
    body: [
      'L Officina delle Lanterne e una corporazione di vetrai, lucidatori e tecnici della luce. Produce strumenti per porti, archivi e squadre di manutenzione che lavorano in ambienti saturi di sale.',
      'La reputazione pubblica e solida, ma alcune partite non compaiono nei registri. Talia segue proprio quelle lampade per ricostruire passaggi tra quartiere artigiano e banchine.',
    ],
    links: ['quartiere-lanterne', 'lampada-vetro-freddo', 'talia-cartaccia', 'porto-vetro'],
    searchHints: ['officina', 'lanterne', 'vetro', 'partite non registrate'],
  },
  {
    key: 'incendio-diga-vecchia',
    title: 'Incendio della Diga Vecchia',
    kind: 'event',
    tags: ['evento', 'diga', 'incendio', 'emergenza'],
    body: [
      'L incendio della diga vecchia inizio durante una notte di vento basso, quando nessuno si aspettava fiamme vicino a tanta acqua. Bruciarono passerelle, depositi di grasso e parte dei registri tecnici.',
      'Le indagini produssero versioni incompatibili: incidente, sabotaggio, negligenza o copertura finanziaria. Daro conserva una cronologia tecnica piu precisa delle deposizioni ufficiali.',
    ],
    links: ['daro-chiuse', 'tecnico-chiuse', 'chiave-ruggine-dolce', 'consiglio-maree'],
    searchHints: ['incendio', 'diga', 'sabotaggio', 'emergenza'],
  },
  {
    key: 'festa-braci-chiare',
    title: 'Festa delle Braci Chiare',
    kind: 'event',
    tags: ['evento', 'rituale', 'bosco', 'Veyra'],
    body: [
      'La Festa delle Braci Chiare apre il Bosco di Veyra agli ospiti per una sola notte. Ogni fuoco deve consumare legna raccolta senza ferro, e ogni racconto viene ripetuto tre volte da voci diverse.',
      'Negli ultimi anni i sogni dei visitatori sono diventati piu simili tra loro. Alcuni archivisti sospettano un legame con le voci dormienti e con la cronologia della Luna Spezzata.',
    ],
    links: ['bosco-veyra', 'veyrani', 'registro-sogni', 'archivio-voci-dormienti'],
    searchHints: ['festa', 'braci', 'Veyra', 'sogni ricorrenti'],
  },
  {
    key: 'spedizione-nacre',
    title: 'Spedizione a Nacre',
    kind: 'event',
    tags: ['evento', 'spedizione', 'nacre', 'astronomia'],
    body: [
      'La spedizione a Nacre parti con cartografi, archivisti e due tecnici delle bussole. Doveva verificare strumenti astronomici, ma torno con mappe di correnti e registrazioni sonore difficili da tradurre.',
      'Il rapporto finale fu diviso in tre fascicoli: osservazioni celesti, lingua nacreana e anomalie costiere. Solo il primo venne pubblicato senza tagli.',
    ],
    links: ['osservatorio-nacre', 'nacreani', 'lingua-nacreana', 'mira-valen'],
    searchHints: ['spedizione', 'Nacre', 'astronomia', 'traduzione'],
  },
  {
    key: 'sciopero-battelli',
    title: 'Sciopero dei Battelli',
    kind: 'event',
    tags: ['evento', 'sciopero', 'porto', 'lavoro'],
    body: [
      'Lo sciopero dei battelli blocco il Porto di Vetro per undici giorni. I magazzini si riempirono, le taverne diventarono sale riunioni e il consiglio dichiaro emergenza senza nominare le cause reali.',
      'Orun firmo tre tregue provvisorie e vide fallirne due. La terza resse perche collegava salari, turni e accesso alle banchine in un unico accordo.',
    ],
    links: ['orun-mastro', 'mediatore-porto', 'contratto-sette-banchine', 'porto-vetro'],
    searchHints: ['sciopero', 'battelli', 'salari', 'porto'],
  },
  {
    key: 'processo-mappe-false',
    title: 'Processo delle Mappe False',
    kind: 'event',
    tags: ['evento', 'processo', 'mappe', 'prove'],
    body: [
      'Il processo delle mappe false dimostro che una rotta alterata poteva spostare colpe, eredita e diritti di pesca. Le udienze trasformarono dettagli tecnici in accuse politiche.',
      'La sentenza non chiuse il caso. Da allora ogni mappa importante richiede fonte, data, strumento usato e almeno un confronto indipendente.',
    ],
    links: ['mira-valen', 'gilda-bussole', 'archivista-campo', 'talia-cartaccia'],
    searchHints: ['processo', 'mappe false', 'prove', 'rotte alterate'],
  },
  {
    key: 'cronologia-luna-spezzata',
    title: 'Cronologia della Luna Spezzata',
    kind: 'lore',
    tags: ['lore', 'luna', 'mitologia', 'cronologia'],
    body: [
      'La Luna Spezzata non e solo un mito: e una struttura cronologica usata da popoli diversi per datare maree anomale, nascite fuori stagione e variazioni nelle bussole.',
      'Le fonti non concordano sul primo segno. I Veyrani parlano di canti nel bosco, i Nacreani di misure celesti, i Figli del Sale di gallerie diventate blu in una notte.',
    ],
    links: ['veyrani', 'nacreani', 'figli-sale', 'maree-nere'],
    searchHints: ['Luna Spezzata', 'mitologia', 'cronologia', 'maree anomale'],
  },
  {
    key: 'sigilli-sotto-eron',
    title: 'Sigilli sotto Eron',
    kind: 'lore',
    tags: ['lore', 'sigilli', 'sotterranei', 'archivio'],
    body: [
      'I sigilli sotto Eron compaiono in miniera, archivi e vecchie fondamenta portuali. Non sono decorazioni: la ripetizione degli stessi tratti suggerisce un sistema di avvisi o chiusure.',
      'Selene ritiene che i sigilli segnino luoghi dove la memoria deve restare ferma. Talia invece li collega a lampade usate per leggere incisioni senza attivare reazioni chimiche.',
    ],
    links: ['selene-registri', 'miniera-sale-blu', 'lampada-vetro-freddo', 'custodi-archivio-basso'],
    searchHints: ['sigilli', 'Eron', 'sotterranei', 'archivio'],
  },
  {
    key: 'maree-nere',
    title: 'Teoria delle Maree Nere',
    kind: 'lore',
    tags: ['lore', 'marea nera', 'anomalia', 'ricerca'],
    body: [
      'La teoria delle maree nere descrive correnti scure che non seguono vento, luna o pressione. Appaiono prima come odore di ferro, poi come riflessi opachi vicino alle foci.',
      'Le note migliori incrociano bussole, piante salmastre, osservazioni di Nacre e registri dei battellieri. La ricerca semantica dovrebbe avvicinare query su anomalia, correnti, piante e strumenti.',
    ],
    links: ['bussola-correnti', 'erbario-nima', 'osservatorio-nacre', 'nima-serra'],
    searchHints: ['marea nera', 'correnti scure', 'anomalia', 'strumenti'],
  },
  {
    key: 'archivio-voci-dormienti',
    title: 'Archivio delle Voci Dormienti',
    kind: 'lore',
    tags: ['lore', 'voci', 'memoria', 'archivio'],
    body: [
      'Le voci dormienti sono registrazioni, canti o ricordi che sembrano attivarsi quando piu fonti raccontano la stessa cosa nello stesso luogo. Non e chiaro se siano fenomeno, tecnica o superstizione.',
      'I Custodi dell Archivio Basso conservano casi ripetuti: sogni uguali dopo la festa, note sonore di Nacre e testimonianze di minatori che ricordano parole mai udite.',
    ],
    links: ['custodi-archivio-basso', 'festa-braci-chiare', 'registro-sogni', 'lingua-nacreana'],
    searchHints: ['voci dormienti', 'memoria', 'sogni', 'archivio'],
  },
  {
    key: 'lingua-nacreana',
    title: 'Lingua nacreana dei registri sonori',
    kind: 'lore',
    tags: ['lore', 'lingua', 'Nacre', 'traduzione'],
    body: [
      'La lingua nacreana usa pause, inclinazioni e battiti leggeri come parte del testo. Una trascrizione alfabetica perde informazioni su intensita, direzione dello sguardo e ruolo del testimone.',
      'La spedizione porto campioni sonori incompleti. Selene propone di archiviarli come oggetti ibridi: documento, mappa e rito nello stesso record.',
    ],
    links: ['nacreani', 'osservatorio-nacre', 'spedizione-nacre', 'selene-registri'],
    searchHints: ['lingua nacreana', 'registri sonori', 'traduzione', 'Nacre'],
  },
  {
    key: 'diario-mercato',
    title: 'Diario operativo del mercato',
    kind: 'note',
    tags: ['nota', 'mercato', 'commercio', 'routine'],
    body: [
      'Annotazioni sparse raccolte durante settimane di mercato: prezzi del pesce, ritardi dei carri, umore degli scaricatori, arrivi dalla miniera e venditori che cambiano banco senza preavviso.',
      'La nota sembra ordinaria ma aiuta la ricerca semantica a collegare commercio, sale blu, porto e scioperi. Molte informazioni lunghe nascono proprio da dettagli ripetuti senza enfasi.',
    ],
    links: ['porto-vetro', 'compagnia-sale-blu', 'sciopero-battelli', 'appunti-cucina-molo'],
    searchHints: ['mercato', 'prezzi', 'commercio', 'routine'],
  },
  {
    key: 'checklist-riparazioni',
    title: 'Checklist riparazioni invernali',
    kind: 'note',
    tags: ['nota', 'manutenzione', 'inverno', 'controllo'],
    body: [
      'Controllare cerniere delle chiuse, corde dei contrappesi, vetro delle lampade, scorte di grasso, guanti cerati e percorsi asciutti per le squadre notturne.',
      'Segnare ogni intervento con tempo, odore della ruggine e nome del tecnico presente. Daro insiste che una checklist breve salva piu vite di un rapporto elegante scritto troppo tardi.',
    ],
    links: ['daro-chiuse', 'tecnico-chiuse', 'chiave-ruggine-dolce', 'incendio-diga-vecchia'],
    searchHints: ['checklist', 'riparazioni', 'inverno', 'chiuse'],
  },
  {
    key: 'appunti-cucina-molo',
    title: 'Appunti cucina del molo',
    kind: 'note',
    tags: ['nota', 'cucina', 'molo', 'quotidiano'],
    body: [
      'Zuppa di alghe chiare con lenticchie, pane tostato e olio di semi salmastri. Aggiungere foglie dell erbario solo dopo averle sciacquate tre volte, altrimenti il brodo diventa troppo metallico.',
      'Ricetta nata per turni lunghi al porto, utile come testo domestico e laterale rispetto alle note politiche. Dovrebbe risultare vicina a query su cibo, molo, piante e sale.',
    ],
    links: ['nima-serra', 'erbario-nima', 'diario-mercato', 'porto-vetro'],
    searchHints: ['cucina', 'molo', 'zuppa', 'piante salmastre'],
  },
  {
    key: 'registro-sogni',
    title: 'Registro sogni ricorrenti',
    kind: 'note',
    tags: ['nota', 'sogni', 'memoria', 'pattern'],
    body: [
      'Sogno ripetuto: un corridoio umido, una lampada fredda, cenere sotto i piedi e una voce che chiede di non aprire la terza porta. Variante comune dopo la festa delle braci chiare.',
      'I sogni non sono prova, ma diventano dati quando molte persone riportano la stessa sequenza. Collegare data, luogo, cibo consumato e vicinanza a registri sonori.',
    ],
    links: ['festa-braci-chiare', 'archivio-voci-dormienti', 'bosco-veyra', 'lampada-vetro-freddo'],
    searchHints: ['sogni ricorrenti', 'voce', 'lampada', 'festa'],
  },
  {
    key: 'segnale-non-classificato',
    title: 'Segnale non classificato sul canale tre',
    kind: 'custom',
    tags: ['custom', 'segnale', 'anomalia', 'rumore'],
    body: [
      'Segnale intermittente ascoltato sul canale tre durante una notte senza traffico. Pattern: tre impulsi bassi, pausa lunga, due fruscii simili a onde registrate al contrario.',
      'Non appartiene alle procedure portuali note. Potrebbe essere interferenza, registrazione nacreana danneggiata o codice usato da equipaggi che non vogliono passare dai mediatori.',
    ],
    links: ['lingua-nacreana', 'porto-vetro', 'maree-nere', 'orun-mastro'],
    searchHints: ['segnale', 'canale tre', 'anomalia', 'fruscio'],
  },
  {
    key: 'frammento-senza-provenienza',
    title: 'Frammento senza provenienza',
    kind: 'custom',
    tags: ['custom', 'frammento', 'prova', 'incerto'],
    body: [
      'Frammento di carta cerata con una linea di costa, tre punti blu e un numero senza unita di misura. Non ci sono firme, ma la pressione del tratto ricorda strumenti usati dai cartografi di maree.',
      'Da usare come distrattore quasi pertinente: sembra collegato a mappe, archivio e sale blu, ma nessun riferimento e abbastanza forte da chiudere il caso.',
    ],
    links: ['archivista-campo', 'mira-valen', 'gilda-bussole', 'miniera-sale-blu'],
    searchHints: ['frammento', 'provenienza incerta', 'mappe', 'prova'],
  },
];

function shuffled<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let currentIndex = copy.length - 1; currentIndex > 0; currentIndex -= 1) {
    const randomIndex = Math.floor(Math.random() * (currentIndex + 1));
    [copy[currentIndex], copy[randomIndex]] = [copy[randomIndex], copy[currentIndex]];
  }
  return copy;
}

function seedFolderFor(kind: EntityKind, index: number): string | null {
  if (selectedFolderId.value) return selectedFolderId.value;
  const availableFolders = folders.flat.value;
  if (availableFolders.length === 0) return null;
  const matchingFolders = availableFolders.filter(
    (folder) => folders.effectiveFor(folder.id).defaultKind === kind,
  );
  const pool = matchingFolders.length > 0 ? matchingFolders : availableFolders;
  return pool[index % pool.length]?.id ?? null;
}

function seedTags(template: SemanticSeedTemplate, batchId: string): string[] {
  return Array.from(new Set([
    'dev-semantic',
    'linked-corpus',
    'long-lived-archive',
    `batch-${batchId}`,
    template.kind,
    ...template.tags,
  ]));
}

function buildSeedTitle(template: SemanticSeedTemplate, batchId: string, index: number): string {
  return `DEV ARCH ${batchId}-${String(index + 1).padStart(2, '0')} - ${template.title}`;
}

function buildSeedDrafts(): SemanticSeedDraft[] {
  const batchId = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 12);
  return shuffled(longTermSeedTemplates).map((template, index) => ({
    index,
    batchId,
    template,
    title: buildSeedTitle(template, batchId, index),
    folderId: seedFolderFor(template.kind, index),
  }));
}

function wikiLinkFor(
  key: string,
  draft: SemanticSeedDraft,
  titleByKey: Map<string, string>,
  templateByKey: Map<string, SemanticSeedTemplate>,
): string | null {
  const targetTitle = titleByKey.get(key);
  if (!targetTitle || targetTitle === draft.title) return null;
  const alias = templateByKey.get(key)?.title ?? key;
  return `[[${targetTitle}|${alias}]]`;
}

function buildSeedContent(
  draft: SemanticSeedDraft,
  titleByKey: Map<string, string>,
  templateByKey: Map<string, SemanticSeedTemplate>,
): string {
  const links = draft.template.links
    .map((key) => wikiLinkFor(key, draft, titleByKey, templateByKey))
    .filter((link): link is string => link !== null);

  return [
    `# ${draft.template.title}`,
    '',
    `Registro importato dal batch ${draft.batchId}. Categoria: ${draft.template.kind}.`,
    '',
    ...draft.template.body,
    '',
    '## Connessioni',
    ...links.map((link) => `- ${link} - riferimento usato in piu note del corpus.`),
    '',
    '## Indizi di ricerca',
    `Query utili: ${draft.template.searchHints.join(', ')}.`,
    `Tag: ${seedTags(draft.template, draft.batchId).join(', ')}.`,
  ].join('\n');
}

async function materializeSeedGraphLinks(
  drafts: SemanticSeedDraft[],
  created: Note[],
): Promise<void> {
  const idByKey = new Map<string, string>();
  for (const [index, draft] of drafts.entries()) {
    const note = created[index];
    if (note) idByKey.set(draft.template.key, note.id);
  }

  for (const [index, draft] of drafts.entries()) {
    const source = created[index];
    if (!source) continue;
    const targetIds = new Set<string>();
    for (const key of draft.template.links) {
      const targetId = idByKey.get(key);
      if (!targetId || targetId === source.id || targetIds.has(targetId)) continue;
      targetIds.add(targetId);
      await api.links.create({ sourceId: source.id, targetId, type: 'wikilink' });
    }
  }
}

/**
 * Currently scoped folder. `null` = "All notes / Inbox".
 *
 * Single source of truth for:
 *   - filtering of the sidebar list (recursive include of descendants)
 *   - default `folderId` for newly created notes
 *   - default `kind` (via folder inheritance)
 *   - server-side scoping of semantic search
 *
 * Synced both ways with the `?folder=` query param so deep-links work.
 */
const selectedFolderId = ref<string | null>(null);

/** Always recurse for v1 — flat-folder UX is more intuitive than per-folder
 *  scoping. We can expose a per-search toggle later if users ask for it. */
const semanticRecursive = ref(true);

const editorMode = ref<EditorMode>('wysiwyg');

const saving = ref(false);
const lastSavedAt = ref<number | null>(null);
const nowTick = ref(Date.now());
let tickHandle: ReturnType<typeof setInterval> | null = null;

const rightCollapsed = ref(false);

// --- Editor right-click context menu ---
const editorMenuOpen = ref(false);
const editorMenuX = ref(0);
const editorMenuY = ref(0);
const editorMenuItems = ref<UiContextMenuItem[]>([]);

function onEditorContextMenu(payload: { x: number; y: number; items: ContextMenuItem[] }): void {
  editorMenuX.value = payload.x;
  editorMenuY.value = payload.y;
  editorMenuItems.value = payload.items as UiContextMenuItem[];
  editorMenuOpen.value = true;
}

// --- Editor prompt (image URL, link URL, …) ---
interface PromptRequestPayload {
  title: string;
  label?: string;
  placeholder?: string;
  initialValue?: string;
  confirmLabel?: string;
  resolve: (value: string | null) => void;
}

const promptOpen = ref(false);
const promptTitle = ref('');
const promptLabel = ref('');
const promptPlaceholder = ref('');
const promptInitial = ref('');
const promptConfirmLabel = ref('Save');
let promptResolver: ((value: string | null) => void) | null = null;

function onEditorPrompt(payload: PromptRequestPayload): void {
  promptTitle.value = payload.title;
  promptLabel.value = payload.label ?? '';
  promptPlaceholder.value = payload.placeholder ?? '';
  promptInitial.value = payload.initialValue ?? '';
  promptConfirmLabel.value = payload.confirmLabel ?? 'Save';
  promptResolver = payload.resolve;
  promptOpen.value = true;
}

function onPromptSubmit(value: string): void {
  promptResolver?.(value);
  promptResolver = null;
}

function onPromptCancel(): void {
  promptResolver?.(null);
  promptResolver = null;
}

const backlinks = ref<BacklinkEntry[]>([]);
const backlinksLoading = ref(false);

const selected = computed<Note | null>(
  () => notes.value.find((n) => n.id === selectedId.value) ?? null,
);

// --- Loading & selection ---
async function load(): Promise<void> {
  notes.value = await api.notes.list();
}

function applyDraft(n: Note): void {
  selectedId.value = n.id;
  draftTitle.value = n.title;
  draftKind.value = (n.kind as EntityKind) ?? 'note';
  draftContent.value = n.content ?? '';
  draftJson.value = n.contentJson ?? null;
  draftTags.value = Array.isArray(n.tags) ? [...n.tags] : [];
  lastSavedAt.value = Date.parse(n.updatedAt) || Date.now();
}

function selectById(id: string): void {
  const n = notes.value.find((x) => x.id === id);
  if (n) applyDraft(n);
}

function openCreateNote(): void {
  createNoteError.value = '';
  createNoteOpen.value = true;
}

async function createNew(payload: {
  title: string;
  kind: EntityKind;
  content: string;
  folderId: string | null;
}): Promise<void> {
  createNoteBusy.value = true;
  createNoteError.value = '';
  try {
    const created = await api.notes.create(payload);
    createNoteOpen.value = false;
    await load();
    void folders.refresh();
    applyDraft(created);
  } catch (err) {
    createNoteError.value = err instanceof Error ? err.message : String(err);
  } finally {
    createNoteBusy.value = false;
  }
}

async function seedSemanticTestNotes(): Promise<void> {
  if (!isDev || seedNotesBusy.value) return;
  seedNotesBusy.value = true;
  seedNotesError.value = '';
  const created: Note[] = [];
  try {
    await folders.load();
    const drafts = buildSeedDrafts();
    const titleByKey = new Map(drafts.map((draft) => [draft.template.key, draft.title]));
    const templateByKey = new Map(longTermSeedTemplates.map((template) => [
      template.key,
      template,
    ]));
    for (const draft of drafts) {
      created.push(await api.notes.create({
        title: draft.title,
        kind: draft.template.kind,
        content: draft.template.body.join('\n\n'),
        tags: seedTags(draft.template, draft.batchId),
        folderId: draft.folderId,
      }));
    }
    for (const [index, draft] of drafts.entries()) {
      const note = created[index];
      if (!note) continue;
      created[index] = await api.notes.update(note.id, {
        title: draft.title,
        kind: draft.template.kind,
        content: buildSeedContent(draft, titleByKey, templateByKey),
        tags: seedTags(draft.template, draft.batchId),
        folderId: draft.folderId,
      });
    }
    await materializeSeedGraphLinks(drafts, created);
    await load();
    void folders.refresh();
    if (created[0]) applyDraft(created[0]);
  } catch (err) {
    seedNotesError.value = err instanceof Error ? err.message : String(err);
  } finally {
    seedNotesBusy.value = false;
  }
}

// --- Folder CRUD wiring ---
const folderFormOpen = ref(false);
const folderFormMode = ref<'create' | 'edit'>('create');
const folderFormParentId = ref<string | null>(null);
const folderFormTarget = ref<FolderNode | null>(null);

function openCreateFolder(parentId: string | null): void {
  folderFormMode.value = 'create';
  folderFormParentId.value = parentId;
  folderFormTarget.value = null;
  folderFormOpen.value = true;
}

function openEditFolder(folder: FolderNode): void {
  folderFormMode.value = 'edit';
  folderFormTarget.value = folder;
  folderFormParentId.value = folder.parentId;
  folderFormOpen.value = true;
}

const folderDeleteTarget = ref<FolderNode | null>(null);
const folderDeleteMessage = computed(() =>
  folderDeleteTarget.value
    ? `Delete folder "${folderDeleteTarget.value.name}"? Notes inside will move to the parent folder (or root). This cannot be undone.`
    : '',
);

function requestDeleteFolder(folder: FolderNode): void {
  folderDeleteTarget.value = folder;
}

async function confirmDeleteFolder(): Promise<void> {
  const f = folderDeleteTarget.value;
  folderDeleteTarget.value = null;
  if (!f) return;
  await folders.remove(f.id);
  // If the user was scoped inside the deleted folder, jump back to root so
  // the sidebar list isn't pointing at a phantom selection.
  if (selectedFolderId.value === f.id) selectedFolderId.value = null;
  await load(); // refresh notes list — server's ON DELETE SET NULL frees them
}

async function moveNoteToFolder(payload: { noteId: string; folderId: string | null }): Promise<void> {
  await api.notes.move(payload.noteId, payload.folderId);
  await load();
  void folders.refresh(); // note counts changed
}

// --- URL ↔ folder scope sync ---
//
// `?folder=<id>` is the canonical state; `selectedFolderId` is its in-memory
// mirror. Each side updates the other only when actually different to avoid
// router-loops.
watch(selectedFolderId, (id) => {
  const current = typeof route.query.folder === 'string' ? route.query.folder : null;
  const next = id ?? undefined;
  if ((current ?? null) === (id ?? null)) return;
  void router.replace({ query: { ...route.query, folder: next } });
});

watch(
  () => route.query.folder,
  (qid) => {
    const id = typeof qid === 'string' && qid ? qid : null;
    if (id !== selectedFolderId.value) selectedFolderId.value = id;
  },
);

// Custom in-app delete confirmation (replaces native window.confirm so the
// dialog matches the rest of the design system).
const deleteTargetId = ref<string | null>(null);
const deleteTargetLabel = computed<string>(() => {
  const id = deleteTargetId.value;
  if (!id) return '';
  const n = notes.value.find((x) => x.id === id);
  return n?.title?.trim() || '(untitled)';
});
const deleteMessage = computed<string>(() =>
  deleteTargetId.value
    ? `Delete "${deleteTargetLabel.value}"? This cannot be undone.`
    : '',
);

function remove(id: string): void {
  deleteTargetId.value = id;
}

async function confirmDeleteNote(): Promise<void> {
  const id = deleteTargetId.value;
  deleteTargetId.value = null;
  if (!id) return;
  await api.notes.remove(id);
  if (selectedId.value === id) selectedId.value = null;
  await load();
}

// --- Auto-save ---
const persist = useDebounceFn(async () => {
  if (!selectedId.value) return;
  saving.value = true;
  try {
    const updated = await api.notes.update(selectedId.value, {
      title: draftTitle.value || 'Untitled',
      kind: draftKind.value,
      content: draftContent.value,
      contentJson: draftJson.value as Note['contentJson'],
      tags: draftTags.value,
    });
    const idx = notes.value.findIndex((n) => n.id === updated.id);
    if (idx >= 0) notes.value[idx] = updated;
    lastSavedAt.value = Date.now();
  } finally {
    saving.value = false;
    void refreshBacklinks();
  }
}, 600);

watch(
  [draftTitle, draftKind, draftContent, draftTags],
  () => { if (selectedId.value) void persist(); },
  { deep: true },
);

// --- Semantic search ---
//
// Strategy:
//   1. The actual network request is debounced (500 ms) so rapid typing /
//      autocorrect doesn't fire one query per keystroke.
//   2. `semanticBusy` flips to `true` *synchronously* the moment the user
//      types in semantic mode, so the spinner appears immediately during
//      the debounce window — no perceived dead time.
//   3. Each request gets a monotonically increasing token; out-of-order
//      responses (e.g. a slow earlier query returning after a fresher one)
//      are discarded so stale results never overwrite fresh ones.
//   4. In-flight requests are aborted via AbortController when a new query
//      starts, so the server stops doing work the user no longer cares about.
//   5. Below the minimum length we don't even hit the API.
const SEMANTIC_MIN_LEN = 2;
let semanticToken = 0;
let semanticAbort: AbortController | null = null;

const runSemanticSearch = useDebounceFn(async () => {
  const q = search.value.trim();
  const myToken = ++semanticToken;

  // Cancel any in-flight request — its results would be stale anyway.
  semanticAbort?.abort();

  if (!embeddingsAvailable.value || q.length < SEMANTIC_MIN_LEN) {
    semanticHits.value = [];
    semanticBusy.value = false;
    semanticAbort = null;
    return;
  }

  const ctrl = new AbortController();
  semanticAbort = ctrl;
  try {
    const hits = await api.notes.semanticSearch(q, ctrl.signal, {
      folderId: selectedFolderId.value,
      recursive: semanticRecursive.value,
    });
    if (myToken !== semanticToken) return; // a newer request superseded us
    semanticHits.value = hits;
  } catch (err) {
    if ((err as DOMException)?.name === 'AbortError') return;
    if (myToken !== semanticToken) return;
    semanticHits.value = [];
  } finally {
    if (myToken === semanticToken) {
      semanticBusy.value = false;
      semanticAbort = null;
    }
  }
}, 500);

watch([search, searchMode, selectedFolderId, semanticRecursive], () => {
  if (searchMode.value !== 'semantic') {
    semanticHits.value = [];
    semanticBusy.value = false;
    semanticAbort?.abort();
    semanticAbort = null;
    return;
  }
  // Flip busy on synchronously so the spinner shows during the debounce
  // window. Only do so when the query is long enough to actually trigger
  // a search — otherwise we'd be lying to the user.
  if (embeddingsAvailable.value && search.value.trim().length >= SEMANTIC_MIN_LEN) {
    semanticBusy.value = true;
  } else {
    semanticBusy.value = false;
  }
  void runSemanticSearch();
});

// If the embedding model disappears (e.g. provider went offline), force the
// sidebar back to filter mode so the user isn't stuck on a disabled tab.
watch(embeddingsAvailable, (available) => {
  if (!available && searchMode.value === 'semantic') {
    searchMode.value = 'filter';
  }
});

// --- Backlinks ---
const refreshBacklinks = useDebounceFn(async () => {
  const id = selectedId.value;
  if (!id) { backlinks.value = []; return; }
  backlinksLoading.value = true;
  try {
    backlinks.value = await api.notes.backlinks(id);
  } catch {
    backlinks.value = [];
  } finally {
    backlinksLoading.value = false;
  }
}, 300);

watch(selectedId, () => {
  backlinks.value = [];
  if (selectedId.value) void refreshBacklinks();
});

// --- Lifecycle ---
onMounted(() => {
  void (async () => {
    await Promise.all([load(), folders.load()]);
    const folderParam = route.query.folder;
    if (typeof folderParam === 'string' && folderParam) selectedFolderId.value = folderParam;
    const noteParam = route.query.note;
    if (typeof noteParam === 'string' && noteParam) selectById(noteParam);
  })();
  tickHandle = setInterval(() => { nowTick.value = Date.now(); }, 5000);
});

watch(
  () => route.query.note,
  (id) => {
    if (typeof id === 'string' && id && id !== selectedId.value) selectById(id);
  },
);

onBeforeUnmount(() => {
  if (tickHandle) clearInterval(tickHandle);
  semanticAbort?.abort();
  semanticAbort = null;
  promptResolver?.(null);
  promptResolver = null;
});
</script>

<template>
  <div class="notes-layout" :class="{ 'right-collapsed': rightCollapsed }">
    <NotesSidebar class="pane left" :notes="notes" :selected-id="selectedId" :selected-folder-id="selectedFolderId"
      :search-query="search" :search-mode="searchMode" :semantic-hits="semanticHits" :semantic-busy="semanticBusy"
      :semantic-available="embeddingsAvailable" :dev-mode="isDev" :seed-busy="seedNotesBusy"
      :seed-error="seedNotesError" @update:search-query="(v: string) => (search = v)"
      @update:search-mode="(v: SearchMode) => (searchMode = v)"
      @update:selected-folder-id="(v: string | null) => (selectedFolderId = v)" @select="selectById"
      @create="openCreateNote" @seed-test-notes="seedSemanticTestNotes" @delete="remove"
      @run-semantic="runSemanticSearch" @create-folder="openCreateFolder" @edit-folder="openEditFolder"
      @delete-folder="requestDeleteFolder" @move-note="moveNoteToFolder" />

    <section v-if="selected" class="pane center">
      <NoteEditorHeader :title="draftTitle" :kind="draftKind" :tags="draftTags" :folder-id="selected.folderId ?? null"
        :editor-mode="editorMode" :saved-at="lastSavedAt" :saving="saving" :now-tick="nowTick"
        @update:title="(v: string) => (draftTitle = v)" @update:kind="(v: EntityKind) => (draftKind = v)"
        @update:tags="(v: string[]) => (draftTags = v)" @update:editor-mode="(v: EditorMode) => (editorMode = v)"
        @navigate-folder="(id: string | null) => (selectedFolderId = id)" @delete="remove(selected!.id)" />

      <ContinuumEditor v-model="draftContent" v-model:json="draftJson" :mode="editorMode"
        placeholder="Write lore, character notes, anything…" @request-context-menu="onEditorContextMenu"
        @request-prompt="onEditorPrompt" />
    </section>

    <EmptyEditor v-else class="pane center" @create="openCreateNote" />

    <RightSidebar class="pane right" :note="selected" :notes="notes" :backlinks="backlinks"
      :backlinks-loading="backlinksLoading" :collapsed="rightCollapsed"
      @update:collapsed="(v: boolean) => (rightCollapsed = v)" @select="selectById" />

    <UiContextMenu v-model="editorMenuOpen" :x="editorMenuX" :y="editorMenuY" :items="editorMenuItems" />

    <UiPromptModal v-model="promptOpen" :title="promptTitle" :label="promptLabel" :placeholder="promptPlaceholder"
      :initial-value="promptInitial" :confirm-label="promptConfirmLabel" @submit="onPromptSubmit"
      @cancel="onPromptCancel" />

    <UiConfirmModal :model-value="deleteTargetId !== null" title="Delete note" :message="deleteMessage"
      confirm-label="Delete" confirm-variant="danger" @confirm="confirmDeleteNote" @cancel="deleteTargetId = null"
      @update:model-value="(v) => { if (!v) deleteTargetId = null; }" />

    <NoteCreateModal v-model="createNoteOpen" :default-folder-id="selectedFolderId" :busy="createNoteBusy"
      :error="createNoteError" context="notes" @submit="createNew" />

    <FolderForm v-model="folderFormOpen" :mode="folderFormMode" :parent-id="folderFormParentId"
      :folder="folderFormTarget" @saved="() => { void folders.refresh(); }" />

    <UiConfirmModal :model-value="folderDeleteTarget !== null" title="Delete folder" :message="folderDeleteMessage"
      confirm-label="Delete" confirm-variant="danger" @confirm="confirmDeleteFolder" @cancel="folderDeleteTarget = null"
      @update:model-value="(v) => { if (!v) folderDeleteTarget = null; }" />
  </div>
</template>

<style scoped>
.notes-layout {
  display: grid;
  grid-template-columns: var(--layout-notes-sidebar-w) 1fr var(--layout-right-sidebar-w);
  gap: var(--space-4);
  height: 100%;
  min-height: 0;
}

.notes-layout.right-collapsed {
  grid-template-columns: var(--layout-notes-sidebar-w) 1fr 40px;
}

.pane {
  background: var(--surface-1);
  border: var(--border-width-1) solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-6);
  overflow: hidden;
  min-height: 0;
  box-shadow: none;
  color: var(--fg);
  display: flex;
  flex-direction: column;
}

/* When the right pane collapses to a narrow rail, drop the heavy padding
   so the lone toggle button sits cleanly centred. */
.notes-layout.right-collapsed .pane.right {
  padding: var(--space-4) var(--space-2);
}

.pane.center {
  gap: var(--space-6);
  background: var(--bg);
}
</style>
