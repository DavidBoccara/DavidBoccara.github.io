// Données du jeu : plages ICAO des pays et capitales, articles Wikipédia par type d'avion,
// listes de rareté, grades, avions célèbres et familles d'avions (filtres et quiz).
// C'est la source de référence : modifier directement ce fichier.
export const D = {
"ranges": [
[
3670016,
3932159,
"FR",
"France"
],
[
3932160,
4194303,
"DE",
"Allemagne"
],
[
4194304,
4456447,
"GB",
"Royaume-Uni"
],
[
3407872,
3670015,
"ES",
"Espagne"
],
[
3145728,
3407871,
"IT",
"Italie"
],
[
4456448,
4489215,
"AT",
"Autriche"
],
[
4489216,
4521983,
"BE",
"Belgique"
],
[
4521984,
4554751,
"BG",
"Bulgarie"
],
[
4554752,
4587519,
"DK",
"Danemark"
],
[
4587520,
4620287,
"FI",
"Finlande"
],
[
4620288,
4653055,
"GR",
"Grèce"
],
[
4653056,
4685823,
"HU",
"Hongrie"
],
[
4685824,
4718591,
"NO",
"Norvège"
],
[
4718592,
4751359,
"NL",
"Pays-Bas"
],
[
4751360,
4784127,
"PL",
"Pologne"
],
[
4784128,
4816895,
"PT",
"Portugal"
],
[
4816896,
4849663,
"CZ",
"Tchéquie"
],
[
4849664,
4882431,
"RO",
"Roumanie"
],
[
4882432,
4915199,
"SE",
"Suède"
],
[
4915200,
4947967,
"CH",
"Suisse"
],
[
4947968,
4980735,
"TR",
"Turquie"
],
[
4980736,
5013503,
"RS",
"Serbie"
],
[
5013504,
5014527,
"CY",
"Chypre"
],
[
5021696,
5025791,
"IE",
"Irlande"
],
[
5029888,
5033983,
"IS",
"Islande"
],
[
5046272,
5047295,
"LU",
"Luxembourg"
],
[
5054464,
5055487,
"MT",
"Malte"
],
[
5250048,
5251071,
"HR",
"Croatie"
],
[
5254144,
5255167,
"LV",
"Lettonie"
],
[
5258240,
5259263,
"LT",
"Lituanie"
],
[
5266432,
5267455,
"SK",
"Slovaquie"
],
[
5267456,
5271551,
"SI",
"Slovénie"
],
[
5275648,
5308415,
"UA",
"Ukraine"
],
[
5308416,
5309439,
"BY",
"Biélorussie"
],
[
5312512,
5313535,
"EE",
"Estonie"
],
[
5324800,
5325823,
"GE",
"Géorgie"
],
[
6291456,
6292479,
"AM",
"Arménie"
],
[
6293504,
6294527,
"AZ",
"Azerbaïdjan"
],
[
6828032,
6829055,
"KZ",
"Kazakhstan"
],
[
1048576,
2097151,
"RU",
"Russie"
],
[
65536,
98303,
"EG",
"Égypte"
],
[
131072,
163839,
"MA",
"Maroc"
],
[
163840,
196607,
"TN",
"Tunisie"
],
[
655360,
688127,
"DZ",
"Algérie"
],
[
32768,
65535,
"ZA",
"Afrique du Sud"
],
[
212992,
217087,
"CM",
"Cameroun"
],
[
229376,
233471,
"CI",
"Côte d'Ivoire"
],
[
262144,
266239,
"ET",
"Éthiopie"
],
[
311296,
312319,
"KE",
"Kenya"
],
[
409600,
413695,
"NG",
"Nigeria"
],
[
434176,
435199,
"QA",
"Qatar"
],
[
458752,
459775,
"SN",
"Sénégal"
],
[
851968,
884735,
"MX",
"Mexique"
],
[
7364608,
7368703,
"KW",
"Koweït"
],
[
7389184,
7390207,
"OM",
"Oman"
],
[
7405568,
7438335,
"SA",
"Arabie saoudite"
],
[
7438336,
7471103,
"KR",
"Corée du Sud"
],
[
7536640,
7569407,
"IR",
"Iran"
],
[
7569408,
7602175,
"IL",
"Israël"
],
[
7602176,
7634943,
"JO",
"Jordanie"
],
[
7634944,
7667711,
"LB",
"Liban"
],
[
7667712,
7700479,
"MY",
"Malaisie"
],
[
7700480,
7733247,
"PH",
"Philippines"
],
[
7733248,
7766015,
"PK",
"Pakistan"
],
[
7766016,
7798783,
"SG",
"Singapour"
],
[
7864320,
8126463,
"CN",
"Chine"
],
[
8126464,
8388607,
"AU",
"Australie"
],
[
8388608,
8650751,
"IN",
"Inde"
],
[
8650752,
8912895,
"JP",
"Japon"
],
[
8912896,
8945663,
"TH",
"Thaïlande"
],
[
8945664,
8978431,
"VN",
"Viêt Nam"
],
[
8994816,
8998911,
"BH",
"Bahreïn"
],
[
9003008,
9007103,
"AE",
"Émirats arabes unis"
],
[
9015296,
9016319,
"TW",
"Taïwan"
],
[
9043968,
9076735,
"ID",
"Indonésie"
],
[
10485760,
11534335,
"US",
"États-Unis"
],
[
12582912,
12845055,
"CA",
"Canada"
],
[
13107200,
13139967,
"NZ",
"Nouvelle-Zélande"
],
[
14680064,
14942207,
"AR",
"Argentine"
],
[
14942208,
15204351,
"BR",
"Brésil"
],
[
15204352,
15208447,
"CL",
"Chili"
]
],
"capitals": {
"FR": [
48.86,
2.35
],
"DE": [
52.52,
13.4
],
"GB": [
51.51,
-0.13
],
"ES": [
40.42,
-3.7
],
"IT": [
41.9,
12.5
],
"AT": [
48.21,
16.37
],
"BE": [
50.85,
4.35
],
"BG": [
42.7,
23.32
],
"DK": [
55.68,
12.57
],
"FI": [
60.17,
24.94
],
"GR": [
37.98,
23.73
],
"HU": [
47.5,
19.04
],
"NO": [
59.91,
10.75
],
"NL": [
52.37,
4.9
],
"PL": [
52.23,
21.01
],
"PT": [
38.72,
-9.14
],
"CZ": [
50.08,
14.44
],
"RO": [
44.43,
26.1
],
"SE": [
59.33,
18.07
],
"CH": [
46.95,
7.45
],
"TR": [
39.93,
32.86
],
"RS": [
44.79,
20.45
],
"CY": [
35.17,
33.36
],
"IE": [
53.35,
-6.26
],
"IS": [
64.15,
-21.94
],
"LU": [
49.61,
6.13
],
"MT": [
35.9,
14.51
],
"HR": [
45.81,
15.98
],
"LV": [
56.95,
24.11
],
"LT": [
54.69,
25.28
],
"SK": [
48.15,
17.11
],
"SI": [
46.06,
14.51
],
"UA": [
50.45,
30.52
],
"BY": [
53.9,
27.56
],
"EE": [
59.44,
24.75
],
"GE": [
41.72,
44.79
],
"AM": [
40.18,
44.51
],
"AZ": [
40.41,
49.87
],
"KZ": [
51.17,
71.45
],
"RU": [
55.76,
37.62
],
"EG": [
30.04,
31.24
],
"MA": [
34.02,
-6.84
],
"TN": [
36.81,
10.18
],
"DZ": [
36.75,
3.06
],
"ZA": [
-25.75,
28.19
],
"CM": [
3.87,
11.52
],
"CI": [
5.36,
-4.01
],
"ET": [
9.03,
38.74
],
"KE": [
-1.29,
36.82
],
"NG": [
9.08,
7.4
],
"QA": [
25.29,
51.53
],
"SN": [
14.72,
-17.47
],
"MX": [
19.43,
-99.13
],
"KW": [
29.38,
47.99
],
"OM": [
23.59,
58.41
],
"SA": [
24.71,
46.68
],
"KR": [
37.57,
126.98
],
"IR": [
35.69,
51.39
],
"IL": [
31.77,
35.21
],
"JO": [
31.95,
35.93
],
"LB": [
33.89,
35.5
],
"MY": [
3.14,
101.69
],
"PH": [
14.6,
120.98
],
"PK": [
33.68,
73.05
],
"SG": [
1.35,
103.82
],
"CN": [
39.9,
116.4
],
"AU": [
-35.28,
149.13
],
"IN": [
28.61,
77.21
],
"JP": [
35.68,
139.69
],
"TH": [
13.76,
100.5
],
"VN": [
21.03,
105.85
],
"BH": [
26.23,
50.59
],
"AE": [
24.45,
54.38
],
"TW": [
25.03,
121.57
],
"ID": [
-6.21,
106.85
],
"US": [
38.9,
-77.04
],
"CA": [
45.42,
-75.7
],
"NZ": [
-41.29,
174.78
],
"AR": [
-34.6,
-58.38
],
"BR": [
-15.79,
-47.88
],
"CL": [
-33.45,
-70.67
]
},
"wikiByType": {
"A400": "Airbus A400M Atlas",
"C130": "Lockheed C-130 Hercules",
"C30J": "Lockheed Martin C-130J Super Hercules",
"C160": "Transall C-160",
"C17": "Boeing C-17 Globemaster III",
"C5M": "Lockheed C-5 Galaxy",
"K35R": "Boeing KC-135 Stratotanker",
"CN35": "CASA CN-235",
"C295": "Airbus C-295",
"C27J": "Alenia C-27J Spartan",
"RFAL": "Dassault Rafale",
"MIR2": "Dassault Mirage 2000",
"ALPH": "Dassault-Dornier Alpha Jet",
"EUFI": "Eurofighter Typhoon",
"F16": "General Dynamics F-16 Fighting Falcon",
"F35": "Lockheed Martin F-35 Lightning II",
"F15": "McDonnell Douglas F-15 Eagle",
"F18": "McDonnell Douglas F/A-18 Hornet",
"HAWK": "BAE Systems Hawk",
"PC21": "Pilatus PC-21",
"TEX2": "Beechcraft T-6 Texan II",
"M346": "Alenia Aermacchi M-346 Master",
"E3TF": "Boeing E-3 Sentry",
"E3CF": "Boeing E-3 Sentry",
"R135": "Boeing RC-135",
"P8": "Boeing P-8 Poseidon",
"Q4": "Northrop Grumman RQ-4 Global Hawk",
"MQ9": "General Atomics MQ-9 Reaper",
"B52": "Boeing B-52 Stratofortress",
"FA7X": "Dassault Falcon 7X",
"F900": "Dassault Falcon 900",
"F2TH": "Dassault Falcon 2000",
"TBM7": "Socata TBM 700",
"TBM9": "Daher TBM 900",
"NH90": "NHIndustries NH90",
"TIGR": "Eurocopter Tigre",
"EC25": "Eurocopter EC225 Super Puma",
"PUMA": "Aérospatiale SA 330 Puma",
"AS32": "Eurocopter AS532 Cougar",
"AS65": "Eurocopter AS565 Panther",
"EC45": "Eurocopter EC145",
"H160": "Airbus Helicopters H160",
"H60": "Sikorsky UH-60 Black Hawk",
"H47": "Boeing CH-47 Chinook",
"V22": "Bell-Boeing V-22 Osprey",
"B1": "Rockwell B-1 Lancer",
"B2": "Northrop B-2 Spirit",
"F22": "Lockheed Martin F-22 Raptor",
"U2": "Lockheed U-2",
"E6": "Boeing E-6 Mercury",
"E4": "Boeing E-4",
"VC25": "Boeing VC-25",
"KC46": "Boeing KC-46 Pegasus",
"E2": "Northrop Grumman E-2 Hawkeye",
"F18S": "Boeing F/A-18E/F Super Hornet",
"F18H": "Boeing F/A-18E/F Super Hornet",
"A124": "Antonov An-124 Ruslan",
"A337": "Airbus BelugaXL",
"A3ST": "Airbus Beluga",
"BLCF": "Boeing Dreamlifter",
"IL76": "Iliouchine Il-76",
"MD11": "McDonnell Douglas MD-11",
"DC3": "Douglas DC-3",
"JU52": "Junkers Ju 52",
"SPIT": "Supermarine Spitfire",
"P51": "North American P-51 Mustang"
},
"militaryOnlyTypes": {
"AS50": "Eurocopter Fennec",
"AS55": "Eurocopter Fennec",
"A332": "Airbus A330 MRTT",
"A310": "Airbus A310 MRTT"
},
"civilTypes": {
"ASTR": "Gulfstream G100",
"GALX": "Gulfstream G200",
"G280": "Gulfstream G280",
"A318": "Airbus A318",
"A319": "Airbus A319",
"A320": "Airbus A320",
"A321": "Airbus A321",
"A19N": "Airbus A319neo",
"A20N": "Airbus A320neo",
"A21N": "Airbus A321neo",
"BCS1": "Airbus A220",
"BCS3": "Airbus A220",
"A332": "Airbus A330",
"A333": "Airbus A330",
"A339": "Airbus A330neo",
"A343": "Airbus A340",
"A346": "Airbus A340",
"A359": "Airbus A350",
"A35K": "Airbus A350",
"A388": "Airbus A380",
"B737": "Boeing 737",
"B738": "Boeing 737",
"B739": "Boeing 737",
"B38M": "Boeing 737 MAX",
"B39M": "Boeing 737 MAX",
"B744": "Boeing 747",
"B748": "Boeing 747-8",
"B752": "Boeing 757",
"B763": "Boeing 767",
"B772": "Boeing 777",
"B77W": "Boeing 777",
"B788": "Boeing 787 Dreamliner",
"B789": "Boeing 787 Dreamliner",
"B78X": "Boeing 787 Dreamliner",
"AT72": "ATR 72",
"AT76": "ATR 72",
"AT45": "ATR 42",
"AT46": "ATR 42",
"DH8D": "De Havilland Canada Dash 8",
"CRJ9": "Bombardier CRJ900",
"CRJX": "Bombardier CRJ1000",
"E170": "Embraer 170",
"E190": "Embraer 190",
"E195": "Embraer 195",
"E290": "Embraer E190-E2",
"E295": "Embraer E195-E2",
"C172": "Cessna 172",
"PC12": "Pilatus PC-12",
"EC35": "Eurocopter EC135",
"AS50": "Eurocopter AS350 Écureuil"
},
"militaryCallsign": "^(CTM|FAF|RRR|RCH|NATO|GAF|BAF|IAM|AME|CFC|PLF|HAF|SUI)\\d",
"legendary": [
"B52",
"B1",
"B2",
"F22",
"F35",
"U2",
"SR71",
"Q4",
"E3TF",
"E3CF",
"E6",
"E4",
"R135",
"A124",
"A225",
"AN22",
"C5M",
"BLCF",
"A3ST",
"A337",
"CONC",
"VC25",
"SGUP",
"T160",
"TU95",
"F117",
"SU27",
"MG29",
"C919",
"AJ27"
],
"epic": [
"RFAL",
"MIR2",
"EUFI",
"F16",
"F15",
"F18",
"A400",
"C17",
"K35R",
"KC46",
"P8",
"E2",
"MQ9",
"V22",
"TIGR",
"ALPH",
"HAWK",
"M346",
"B748",
"A388",
"IL76",
"AN12",
"AN26",
"C130",
"C30J",
"C160",
"NH90",
"H47",
"H60",
"A10",
"TOR",
"GRIF",
"F4",
"H64",
"P3",
"MI24",
"HAR",
"F5",
"T38",
"C141"
],
"rareCivil": [
"B744",
"B742",
"A345",
"A346",
"A343",
"B762",
"MD11",
"DC10",
"B752",
"B753",
"DC3",
"JU52",
"SPIT",
"P51",
"GLF6",
"GLF7",
"GL7T",
"BE20",
"CL2T",
"CL2P",
"AT8T",
"S210",
"B703",
"B721",
"B722",
"B731",
"B732",
"B741",
"B743",
"B74S",
"L101",
"CONI",
"DC6",
"DC85",
"DC86",
"DC87",
"DC91",
"DC92",
"DC93",
"DC94",
"DC95",
"L188",
"T154",
"T134",
"T204",
"IL62",
"IL18",
"IL96",
"YK40",
"YK42",
"F27",
"F28",
"AN2",
"A148",
"SU95",
"DHC2",
"DH82",
"HURI",
"B17",
"B25",
"CAT",
"T6",
"ST75",
"YK52",
"EH10",
"N262",
"BALL"
],
"uncommon": [
"A332",
"A333",
"A338",
"A339",
"A359",
"A35K",
"B772",
"B773",
"B77W",
"B77L",
"B788",
"B789",
"B78X",
"B763",
"B764",
"FA7X",
"FA8X",
"F900",
"F2TH",
"GLEX",
"GLF5",
"GLF4",
"CL60",
"C68A",
"C56X",
"E55P",
"PC12",
"TBM9",
"TBM7",
"C172",
"PA28",
"DR40",
"SR22",
"EC35",
"EC45",
"AS50",
"H160",
"EC30",
"B06",
"R44"
],
// Grades : [XP, nom, modèles différents photographiés]. À partir de « Spotter », il faut aussi des photos (validées ;
// les photos anciennes ne comptent pas) : les jeux seuls ne suffisent plus (9/11/2026, levelOf de game.js).
"levels": [
[0, "Observateur", 0],
[100, "Guetteur", 0],
[300, "Spotter", 3],
[700, "Spotter confirmé", 8],
[1500, "Chasseur d'avions", 15],
[3000, "Expert du ciel", 30],
[6000, "As du spotting", 50],
[12000, "Légende du ciel", 100]
],
"emblems": [
"🔭",
"👀",
"📸",
"🎯",
"🦅",
"🛩️",
"🏅",
"👑"
],
"famous": [
{
"name": "Boeing VC-25",
"nickname": "Air Force One",
"description": "L'avion du président des États-Unis, un 747 aux couleurs bleu et blanc.",
"codes": [
"VC25"
],
"military": true
},
{
"name": "Boeing B-52 Stratofortress",
"nickname": "BUFF",
"description": "Bombardier stratégique américain en service depuis 1955, 8 réacteurs.",
"codes": [
"B52"
],
"military": true
},
{
"name": "Rockwell B-1B Lancer",
"nickname": "Bone",
"description": "Bombardier supersonique à géométrie variable de l'US Air Force.",
"codes": [
"B1"
],
"military": true
},
{
"name": "Northrop B-2 Spirit",
"nickname": "Bombardier furtif",
"description": "Aile volante furtive, seulement 19 exemplaires construits.",
"codes": [
"B2"
],
"military": true
},
{
"name": "Lockheed F-22 Raptor",
"nickname": "Raptor",
"description": "Chasseur furtif de 5e génération, réservé à l'US Air Force.",
"codes": [
"F22"
],
"military": true
},
{
"name": "Lockheed F-35 Lightning II",
"nickname": "Panther",
"description": "Chasseur furtif multirôle, en service dans de nombreuses forces de l'OTAN.",
"codes": [
"F35"
],
"military": true
},
{
"name": "Lockheed U-2",
"nickname": "Dragon Lady",
"description": "Avion espion de haute altitude, vole à plus de 21 000 m.",
"codes": [
"U2"
],
"military": true
},
{
"name": "Northrop RQ-4 Global Hawk",
"nickname": "Drone espion",
"description": "Drone de reconnaissance stratégique, souvent en orbite au-dessus de la mer Noire.",
"codes": [
"Q4"
],
"military": true
},
{
"name": "Boeing E-3 Sentry",
"nickname": "AWACS",
"description": "Avion radar reconnaissable à son grand radôme rotatif.",
"codes": [
"E3TF",
"E3CF"
],
"military": true
},
{
"name": "Boeing E-6B Mercury",
"nickname": "TACAMO",
"description": "Poste de commandement volant pour les sous-marins nucléaires américains.",
"codes": [
"E6"
],
"military": true
},
{
"name": "Boeing E-4B Nightwatch",
"nickname": "Doomsday plane",
"description": "Poste de commandement aéroporté américain en cas de crise nucléaire.",
"codes": [
"E4"
],
"military": true
},
{
"name": "Boeing RC-135",
"nickname": "Rivet Joint",
"description": "Avion de renseignement électronique de l'US Air Force et de la RAF.",
"codes": [
"R135"
],
"military": true
},
{
"name": "Lockheed C-5M Super Galaxy",
"nickname": "Galaxy",
"description": "L'un des plus gros avions militaires de transport au monde.",
"codes": [
"C5M"
],
"military": true
},
{
"name": "Antonov An-124 Ruslan",
"nickname": "Condor",
"description": "Cargo géant ukrainien, plus gros avion en service régulier.",
"codes": [
"A124"
],
"military": false
},
{
"name": "Airbus BelugaXL",
"nickname": "Baleine souriante",
"description": "Transporte les tronçons d'Airbus entre les usines, avec ses yeux et son sourire.",
"codes": [
"A337"
],
"military": false
},
{
"name": "Airbus Beluga ST",
"nickname": "Beluga",
"description": "Le premier Beluga, cargo hors gabarit d'Airbus.",
"codes": [
"A3ST"
],
"military": false
},
{
"name": "Boeing 747 Dreamlifter",
"nickname": "Dreamlifter",
"description": "747 au fuselage géant qui transporte les pièces du 787.",
"codes": [
"BLCF"
],
"military": false
},
{
"name": "Dassault Rafale",
"nickname": "Rafale",
"description": "Chasseur omnirôle français de l'Armée de l'Air et de la Marine.",
"codes": [
"RFAL"
],
"military": true
},
{
"name": "Dassault Mirage 2000",
"nickname": "Mirage",
"description": "Chasseur français à aile delta, toujours en service.",
"codes": [
"MIR2"
],
"military": true
},
{
"name": "Eurofighter Typhoon",
"nickname": "Typhoon",
"description": "Chasseur européen (RAF, Luftwaffe, Italie, Espagne).",
"codes": [
"EUFI"
],
"military": true
},
{
"name": "Dassault/Dornier Alpha Jet",
"nickname": "Patrouille de France",
"description": "Avion d'entraînement, monture de la Patrouille de France.",
"codes": [
"ALPH"
],
"military": true
},
{
"name": "General Dynamics F-16",
"nickname": "Viper",
"description": "Chasseur léger le plus répandu au monde.",
"codes": [
"F16"
],
"military": true
},
{
"name": "Boeing F-15 Eagle",
"nickname": "Eagle",
"description": "Chasseur de supériorité aérienne américain.",
"codes": [
"F15"
],
"military": true
},
{
"name": "Boeing F/A-18 Hornet",
"nickname": "Hornet",
"description": "Chasseur embarqué de l'US Navy, aussi en Espagne, Suisse, Finlande.",
"codes": [
"F18",
"F18S",
"F18H"
],
"military": true
},
{
"name": "Airbus A400M Atlas",
"nickname": "Atlas",
"description": "Avion de transport militaire européen à quatre hélices.",
"codes": [
"A400"
],
"military": true
},
{
"name": "Boeing C-17 Globemaster III",
"nickname": "Globemaster",
"description": "Gros porteur militaire américain, britannique et de l'OTAN.",
"codes": [
"C17"
],
"military": true
},
{
"name": "Lockheed C-130 Hercules",
"nickname": "Herc",
"description": "Le transport tactique le plus célèbre, depuis 1954.",
"codes": [
"C130",
"C30J"
],
"military": true
},
{
"name": "Transall C-160",
"nickname": "Transall",
"description": "Transport tactique franco-allemand, devenu très rare.",
"codes": [
"C160"
],
"military": true
},
{
"name": "Boeing KC-135 Stratotanker",
"nickname": "Stratotanker",
"description": "Ravitailleur en vol de l'US Air Force.",
"codes": [
"K35R"
],
"military": true
},
{
"name": "Boeing KC-46 Pegasus",
"nickname": "Pegasus",
"description": "Nouveau ravitailleur américain dérivé du 767.",
"codes": [
"KC46"
],
"military": true
},
{
"name": "Boeing P-8 Poseidon",
"nickname": "Poseidon",
"description": "Patrouilleur maritime anti-sous-marin dérivé du 737.",
"codes": [
"P8"
],
"military": true
},
{
"name": "Northrop Grumman E-2 Hawkeye",
"nickname": "Hawkeye",
"description": "Avion radar embarqué, en service sur le Charles-de-Gaulle.",
"codes": [
"E2"
],
"military": true
},
{
"name": "General Atomics MQ-9 Reaper",
"nickname": "Reaper",
"description": "Drone armé, utilisé par la France et les États-Unis.",
"codes": [
"MQ9"
],
"military": true
},
{
"name": "Bell Boeing V-22 Osprey",
"nickname": "Osprey",
"description": "Convertible à rotors basculants des forces américaines.",
"codes": [
"V22"
],
"military": true
},
{
"name": "Boeing CH-47 Chinook",
"nickname": "Chinook",
"description": "Hélicoptère de transport lourd à deux rotors.",
"codes": [
"H47"
],
"military": true
},
{
"name": "Airbus Helicopters Tigre",
"nickname": "Tigre",
"description": "Hélicoptère de combat franco-allemand.",
"codes": [
"TIGR"
],
"military": true
},
{
"name": "Ilyouchine Il-76",
"nickname": "Candid",
"description": "Cargo quadriréacteur soviétique.",
"codes": [
"IL76"
],
"military": false
},
{
"name": "Airbus A380",
"nickname": "Superjumbo",
"description": "Le plus gros avion de ligne du monde, deux ponts complets.",
"codes": [
"A388"
],
"military": false
},
{
"name": "Boeing 747-8",
"nickname": "Reine du ciel",
"description": "Dernière version du 747, en passagers ou en cargo.",
"codes": [
"B748"
],
"military": false
},
{
"name": "Airbus A330 MRTT",
"nickname": "Phénix",
"description": "Ravitailleur et transport stratégique (Armée de l'Air, OTAN, RAF…).",
"codes": [
"A332"
],
"military": true
},
{
"name": "Boeing 747-400",
"nickname": "Jumbo",
"description": "Le jumbo jet classique, de plus en plus rare en Europe.",
"codes": [
"B744"
],
"military": false
},
{
"name": "Airbus A340-600",
"nickname": "A340",
"description": "Long quadriréacteur, quasiment retiré des compagnies.",
"codes": [
"A346"
],
"military": false
},
{
"name": "McDonnell Douglas MD-11",
"nickname": "MD-11",
"description": "Triréacteur aujourd'hui réservé au cargo.",
"codes": [
"MD11"
],
"military": false
},
{
"name": "Douglas DC-3",
"nickname": "Dakota",
"description": "Légende de 1935, encore en vol pour les meetings.",
"codes": [
"DC3"
],
"military": false
},
{
"name": "Junkers Ju 52",
"nickname": "Tante Ju",
"description": "Trimoteur à tôle ondulée des années 1930.",
"codes": [
"JU52"
],
"military": false
},
{
"name": "Supermarine Spitfire",
"nickname": "Spitfire",
"description": "Le chasseur britannique de la bataille d'Angleterre.",
"codes": [
"SPIT"
],
"military": false
},
{
"name": "North American P-51 Mustang",
"nickname": "Mustang",
"description": "Chasseur américain de la Seconde Guerre mondiale.",
"codes": [
"P51"
],
"military": false
}
],
"helicopters": [
"EC35",
"EC45",
"EC30",
"EC20",
"EC55",
"EC75",
"EC25",
"AS50",
"AS55",
"AS65",
"AS32",
"AS3B",
"PUMA",
"SA31",
"SA34",
"SA36",
"ALO2",
"ALO3",
"H160",
"H60",
"H47",
"H53",
"H64",
"NH90",
"TIGR",
"A109",
"A119",
"A139",
"A169",
"A189",
"B06",
"B407",
"B412",
"B429",
"R22",
"R44",
"R66",
"S76",
"S92",
"MI8",
"MI17",
"CABR",
"G2CA",
"EXPL",
"LYNX",
"EH10",
"BK17",
"B505",
"H500",
"GAZL",
"UH1",
"S61",
"V22",
"MI24"
],
"business": [
"FA7X",
"FA8X",
"FA6X",
"F900",
"F2TH",
"FA50",
"FA10",
"FA20",
"GLF4",
"GLF5",
"GLF6",
"GLF7",
"GA5C",
"GA6C",
"GA7C",
"GA8C",
"GLEX",
"GL5T",
"GL7T",
"CL30",
"CL35",
"CL60",
"C25A",
"C25B",
"C25C",
"C25M",
"C500",
"C501",
"C510",
"C525",
"C550",
"C560",
"C56X",
"C650",
"C680",
"C68A",
"C700",
"C750",
"E50P",
"E55P",
"E545",
"E550",
"LJ35",
"LJ40",
"LJ45",
"LJ60",
"LJ75",
"PRM1",
"HDJT",
"PC24",
"SF50",
"BE40",
"H25B",
"G150",
"G280",
"ASTR",
"PC12",
"TBM7",
"TBM8",
"TBM9",
"B350",
"BE20",
"BE9L",
"P180",
"LJ31",
"LJ36",
"LJ70",
"E35L",
"H25C",
"EA50"
],
"widebody": [
"A306",
"A30B",
"A310",
"A332",
"A333",
"A337",
"A338",
"A339",
"A342",
"A343",
"A345",
"A346",
"A359",
"A35K",
"A388",
"A3ST",
"B741",
"B742",
"B743",
"B744",
"B748",
"BLCF",
"B762",
"B763",
"B764",
"B772",
"B773",
"B77L",
"B77W",
"B778",
"B779",
"B788",
"B789",
"B78X",
"MD11",
"DC10",
"IL76",
"A124",
"A225",
"C17",
"C5M",
"A400",
"B74S",
"L101",
"IL96"
],
"light": [
"C150",
"C152",
"C162",
"C170",
"C172",
"C177",
"C182",
"C206",
"C210",
"P28A",
"P28B",
"P28R",
"PA28",
"PA32",
"PA34",
"PA18",
"PA38",
"PA46",
"DR40",
"DR10",
"DR22",
"DR30",
"R200",
"R300",
"SR20",
"SR22",
"S22T",
"DA20",
"DV20",
"DA40",
"DA42",
"DA62",
"TB9",
"TB10",
"TB20",
"TB21",
"TOBA",
"P208",
"P92",
"A210",
"CAP1",
"CP10",
"C42",
"WT9",
"BR23",
"J3",
"M20P",
"M20T",
"BE33",
"BE35",
"BE36",
"BE55",
"BE58",
"Z42",
"Z242",
"TECN",
"AAT3",
"DIMO",
"GLID",
"ULAC",
"C208",
"C310",
"P28T",
"PA44",
"PA31",
"P46T",
"RALL",
"PC6T",
"KODI",
"E300",
"PTS1",
"PTS2",
"C404",
"C441",
"GYRO",
"BALL"
],
"airliners": [
"A318",
"A319",
"A320",
"A321",
"A19N",
"A20N",
"A21N",
"BCS1",
"BCS3",
"B712",
"B732",
"B733",
"B734",
"B735",
"B736",
"B737",
"B738",
"B739",
"B37M",
"B38M",
"B39M",
"B3XM",
"B752",
"B753",
"AT43",
"AT45",
"AT46",
"AT72",
"AT73",
"AT75",
"AT76",
"DH8A",
"DH8B",
"DH8C",
"DH8D",
"CRJ1",
"CRJ2",
"CRJ7",
"CRJ9",
"CRJX",
"E135",
"E145",
"E170",
"E75L",
"E75S",
"E190",
"E195",
"E290",
"E295",
"SB20",
"F70",
"F100",
"RJ85",
"RJ1H",
"SU95",
"JS41",
"D328",
"J328",
"B721",
"B722",
"B731",
"MD81",
"MD82",
"MD83",
"MD87",
"MD88",
"MD90",
"C919",
"T204",
"AT44",
"DHC6",
"E45X",
"E110",
"E120",
"SF34",
"D228",
"F50",
"B461",
"B462",
"B463",
"RJ70",
"JS31",
"JS32",
"B190",
"L410",
"BN2P",
"C212",
"A148",
"AJ27",
"SH36",
"ATP",
"N262",
"F406"
],
"models": [
{
"label": "Airbus A220",
"codes": [
"BCS1",
"BCS3"
],
"military": false
},
{
"label": "Airbus A320 (famille A318 à A321)",
"codes": [
"A318",
"A319",
"A320",
"A321",
"A19N",
"A20N",
"A21N"
],
"military": false
},
{
"label": "Airbus A330",
"codes": [
"A332",
"A333",
"A338",
"A339"
],
"military": false
},
{
"label": "Airbus A340",
"codes": [
"A342",
"A343",
"A345",
"A346"
],
"military": false
},
{
"label": "Airbus A350",
"codes": [
"A359",
"A35K"
],
"military": false
},
{
"label": "ATR 42 / 72",
"codes": [
"AT43",
"AT45",
"AT46",
"AT72",
"AT73",
"AT75",
"AT76"
],
"military": false
},
{
"label": "Boeing 737",
"codes": [
"B732",
"B733",
"B734",
"B735",
"B736",
"B737",
"B738",
"B739",
"B37M",
"B38M",
"B39M",
"B3XM"
],
"military": false
},
{
"label": "Boeing 757",
"codes": [
"B752",
"B753"
],
"military": false
},
{
"label": "Boeing 767",
"codes": [
"B762",
"B763",
"B764"
],
"military": false
},
{
"label": "Boeing 777",
"codes": [
"B772",
"B773",
"B77L",
"B77W",
"B778",
"B779"
],
"military": false
},
{
"label": "Boeing 787 Dreamliner",
"codes": [
"B788",
"B789",
"B78X"
],
"military": false
},
{
"label": "Bombardier CRJ",
"codes": [
"CRJ1",
"CRJ2",
"CRJ7",
"CRJ9",
"CRJX"
],
"military": false
},
{
"label": "Bombardier Global / Challenger",
"codes": [
"GLEX",
"GL5T",
"GL7T",
"CL30",
"CL35",
"CL60"
],
"military": false
},
{
"label": "Cessna 172 / 182",
"codes": [
"C172",
"C182"
],
"military": false
},
{
"label": "Cessna Citation",
"codes": [
"C25A",
"C25B",
"C25C",
"C25M",
"C500",
"C510",
"C525",
"C550",
"C560",
"C56X",
"C650",
"C680",
"C68A",
"C700",
"C750"
],
"military": false
},
{
"label": "Dassault Falcon",
"codes": [
"FA7X",
"FA8X",
"FA6X",
"F900",
"F2TH",
"FA50",
"FA10",
"FA20"
],
"military": false
},
{
"label": "De Havilland Dash 8",
"codes": [
"DH8A",
"DH8B",
"DH8C",
"DH8D"
],
"military": false
},
{
"label": "Embraer E-Jet",
"codes": [
"E170",
"E75L",
"E75S",
"E190",
"E195",
"E290",
"E295"
],
"military": false
},
{
"label": "Eurocopter / Airbus H135 et H145",
"codes": [
"EC35",
"EC45"
],
"military": false
},
{
"label": "Eurocopter Écureuil",
"codes": [
"AS50",
"AS55"
],
"military": false
},
{
"label": "Gulfstream",
"codes": [
"GLF4",
"GLF5",
"GLF6",
"GLF7",
"GA5C",
"GA6C",
"GA7C",
"GA8C"
],
"military": false
},
{
"label": "Pilatus PC-12",
"codes": [
"PC12"
],
"military": false
},
{
"label": "Robin DR400",
"codes": [
"DR40"
],
"military": false
},
{
"label": "Robinson R22 / R44 / R66",
"codes": [
"R22",
"R44",
"R66"
],
"military": false
},
{
"label": "Super Puma / Cougar / Caracal",
"codes": [
"PUMA",
"AS32",
"EC25"
],
"military": false
},
{
"label": "Daher TBM",
"codes": [
"TBM7",
"TBM8",
"TBM9"
],
"military": false
},
{
"label": "Airbus C295 / CN235",
"codes": [
"C295",
"CN35"
],
"military": true
},
{
"label": "NHIndustries NH90",
"codes": [
"NH90"
],
"military": true
},
{
"label": "Pilatus PC-21",
"codes": [
"PC21"
],
"military": true
}
],
// Quiz : comment reconnaître chaque avion (note affichée après une mauvaise réponse)
"tips": {
"Airbus A220": "Petit biréacteur (100 à 150 places) aux moteurs énormes pour sa taille, presque aussi hauts que le fuselage. Nez fin et effilé, grands hublots.",
"Airbus A320 (famille A318 à A321)": "Nez bien arrondi, moteurs ronds sous les ailes et train d'atterrissage assez haut. En bout d'aile : petites pointes triangulaires ou grands « sharklets » recourbés vers le haut.",
"Airbus A330": "Gros-porteur à 2 moteurs, petits winglets relevés en bout d'aile, 2 jambes de train à 4 roues. Même nez arrondi que l'A340, qui a 4 moteurs.",
"Airbus A340": "Gros-porteur à 4 moteurs sous de longues ailes à winglets, avec une jambe de train supplémentaire au milieu du fuselage. Même nez que l'A330.",
"Airbus A350": "Vitres du cockpit noires qui lui font un « masque de raton laveur ». Ailes très souples dont la pointe se recourbe vers le haut, sans winglet séparé.",
"ATR 42 / 72": "Bimoteur à hélices aux ailes hautes (au-dessus du fuselage) et dérive en T. Le train d'atterrissage rentre dans des carénages sur les côtés du fuselage.",
"Boeing 737": "Nez pointu, moteurs collés sous l'aile (aplatis en dessous sur les anciens modèles), dérive prolongée vers l'avant par un long aileron. L'avion paraît bas sur pattes.",
"Boeing 757": "Fuselage étroit mais très long, gros moteurs et train d'atterrissage haut qui lui donne une allure « nez vers le bas ». Silhouette fine comme un crayon.",
"Boeing 767": "Gros-porteur à 2 moteurs plus fin et plus court que le 777, nez plus pointu que l'A330, 2 jambes de train à 4 roues.",
"Boeing 777": "Énormes moteurs presque aussi larges que le fuselage, 6 roues par jambe de train et queue coupée net à l'arrière comme une lame.",
"Boeing 787 Dreamliner": "Moteurs au bord arrière dentelé (chevrons), ailes très souples qui se relèvent en vol, nez arrondi sans angle avec 4 vitres de cockpit.",
"Bombardier CRJ": "Petit jet régional fin avec ses 2 moteurs à l'arrière du fuselage et une dérive en T. Les Embraer E-Jet, eux, ont les moteurs sous les ailes.",
"Bombardier Global / Challenger": "Jet d'affaires à 2 moteurs à l'arrière et dérive en T ; le Global est long, avec des ailes très en flèche et des winglets.",
"Cessna 172 / 182": "Petit monomoteur à hélice aux ailes hautes (au-dessus de la cabine) tenues par des haubans, avec un train fixe à 3 roues.",
"Cessna Citation": "Petit jet d'affaires à 2 moteurs à l'arrière, aux ailes souvent presque droites (peu en flèche) et au nez court.",
"Dassault Falcon": "Jet d'affaires souvent à 3 moteurs à l'arrière, le troisième sortant au pied de la dérive. Stabilisateur horizontal à mi-hauteur de la dérive.",
"De Havilland Dash 8": "Bimoteur à hélices aux ailes hautes et dérive en T, long nez fin. Le train rentre dans les longues nacelles des moteurs (sur l'ATR : dans le fuselage).",
"Embraer E-Jet": "Jet régional aux 2 moteurs sous les ailes (le CRJ les a à l'arrière), nez pointu, fuselage long et fin, petits winglets.",
"Eurocopter / Airbus H135 et H145": "Hélicoptère bimoteur à patins, avec des portes en coquille à l'arrière de la cabine. Le rotor de queue est souvent caché dans un anneau (fenestron).",
"Eurocopter Écureuil": "Hélicoptère léger à patins, cabine arrondie très vitrée et poutre de queue fine terminée par un petit rotor de queue visible (non caréné).",
"Gulfstream": "Jet d'affaires aux grands hublots ovales, la signature Gulfstream. 2 moteurs à l'arrière, dérive en T et winglets.",
"Pilatus PC-12": "Monomoteur à hélice (turbopropulseur) aux ailes basses à winglets et à dérive en T, avec une grande porte cargo à l'arrière.",
"Robin DR400": "Petit avion à hélice aux ailes basses dont les extrémités remontent nettement (aile « cassée »), grande verrière qui coulisse vers l'avant.",
"Robinson R22 / R44 / R66": "Tout petit hélicoptère à rotor à 2 pales, cabine en goutte d'eau, longue poutre de queue très fine et patins.",
"Super Puma / Cougar / Caracal": "Gros hélicoptère bimoteur à roues, cabine longue avec grande porte latérale, rotor principal à 4 ou 5 pales et rotor de queue classique.",
"Daher TBM": "Monomoteur à hélice rapide aux ailes basses, long capot moteur et empennage classique (stabilisateur en bas de la dérive, pas en T comme le PC-12).",
"Airbus C295 / CN235": "Bimoteur militaire à hélices aux ailes hautes, train dans des carénages sur les côtés et queue relevée au-dessus d'une rampe de chargement.",
"NHIndustries NH90": "Hélicoptère militaire bimoteur au fuselage massif et anguleux, train à roues, rotor à 4 pales et rampe de chargement à l'arrière.",
"Pilatus PC-21": "Avion d'entraînement militaire à hélice à 5 pales, 2 pilotes l'un derrière l'autre sous une longue verrière en bulle : silhouette de petit chasseur.",
"Boeing VC-25": "Le 747 présidentiel américain (« Air Force One ») : bosse à l'avant, 4 moteurs et livrée bleu ciel et blanc « United States of America ».",
"Boeing B-52 Stratofortress": "Bombardier géant à 8 moteurs regroupés par paires sous de très longues ailes fines, avec de petites roues sous le bout des ailes.",
"Rockwell B-1B Lancer": "Bombardier aux ailes à géométrie variable (repliées vers l'arrière à grande vitesse), 4 moteurs groupés par 2 sous le fuselage, nez long et pointu.",
"Northrop B-2 Spirit": "Aile volante noire en forme de boomerang : ni fuselage ni dérive, bord arrière en dents de scie.",
"Lockheed F-22 Raptor": "Chasseur furtif à 2 dérives inclinées vers l'extérieur, ailes en losange, entrées d'air anguleuses sur les côtés et 2 tuyères plates.",
"Lockheed F-35 Lightning II": "Chasseur furtif trapu à 2 dérives inclinées mais un seul moteur : une seule tuyère ronde à l'arrière.",
"Lockheed U-2": "Avion espion aux ailes extrêmement longues et fines comme un planeur, fuselage étroit et cockpit très en avant.",
"Northrop RQ-4 Global Hawk": "Drone géant sans cockpit : nez bombé comme une tête de baleine, réacteur posé sur le dos et empennage en V.",
"Boeing E-3 Sentry": "Boeing 707 militaire à 4 moteurs portant un énorme radar en forme de soucoupe sur 2 mâts au-dessus du fuselage.",
"Boeing E-6B Mercury": "Boeing 707 militaire à 4 gros moteurs ronds, sans radar sur le dos, avec des nacelles d'antennes au bout des ailes.",
"Boeing E-4B Nightwatch": "Boeing 747 militaire blanc et bleu, avec une bosse supplémentaire (radôme) sur le dessus, derrière le pont supérieur.",
"Boeing RC-135": "Avion espion dérivé du 707 : nez allongé en museau et « joues » bombées d'antennes de chaque côté de l'avant du fuselage.",
"Lockheed C-5M Super Galaxy": "Cargo géant à ailes hautes et 4 moteurs, avec une dérive en T très haute et un nez qui se relève entièrement.",
"Antonov An-124 Ruslan": "Cargo géant à ailes hautes et 4 moteurs, comme le C-5, mais avec une dérive classique (pas en T) et des dizaines de roues sous le fuselage.",
"Airbus BelugaXL": "Cargo bossu en forme de baleine, souvent avec des yeux et un sourire peints sur le nez. Petites dérives au bout du stabilisateur horizontal.",
"Airbus Beluga ST": "Cargo bossu dérivé de l'A300 : cockpit placé bas sous l'énorme soute. Plus petit que le BelugaXL et sans visage peint.",
"Boeing 747 Dreamlifter": "Boeing 747 au fuselage gonflé en énorme cylindre derrière le cockpit ; toute la queue pivote pour charger les pièces du 787.",
"Dassault Rafale": "Chasseur à aile delta avec de petits plans « canard » juste devant les ailes, une seule dérive et 2 entrées d'air de chaque côté sous le cockpit.",
"Dassault Mirage 2000": "Chasseur à aile delta pure, un grand triangle sans stabilisateur horizontal, un seul moteur et 2 entrées d'air en demi-cercle sur les côtés.",
"Eurofighter Typhoon": "Chasseur à aile delta avec des plans « canard » très en avant, sous le cockpit, et une large entrée d'air sous le nez qui lui fait une bouche.",
"Dassault/Dornier Alpha Jet": "Petit jet d'entraînement à 2 moteurs, ailes hautes légèrement tombantes, 2 pilotes l'un derrière l'autre : l'avion de la Patrouille de France.",
"General Dynamics F-16": "Chasseur monomoteur à une seule dérive, grande entrée d'air sous le nez et verrière en bulle d'une seule pièce.",
"Boeing F-15 Eagle": "Chasseur à 2 moteurs et 2 dérives bien droites, larges entrées d'air rectangulaires de chaque côté du cockpit.",
"Boeing F/A-18 Hornet": "Chasseur à 2 moteurs et 2 dérives inclinées vers l'extérieur, avec des extensions de l'aile qui avancent le long du cockpit.",
"Airbus A400M Atlas": "Cargo militaire à 4 hélices à 8 pales recourbées en cimeterre, ailes hautes et queue relevée avec une rampe arrière.",
"Boeing C-17 Globemaster III": "Cargo militaire à ailes hautes, 4 réacteurs, dérive en T et winglets, train d'atterrissage dans des carénages sous le fuselage.",
"Lockheed C-130 Hercules": "Cargo militaire à 4 hélices, ailes hautes, nez rond et queue relevée au-dessus d'une rampe de chargement.",
"Transall C-160": "Cargo militaire à 2 hélices et ailes hautes, nez rond et queue relevée avec rampe arrière : plus gros que le C295, moitié moins de moteurs que le C-130.",
"Boeing KC-135 Stratotanker": "Ravitailleur dérivé du 707 : 4 moteurs, perche de ravitaillement rigide sous la queue et très peu de hublots.",
"Boeing KC-46 Pegasus": "Ravitailleur gris dérivé du Boeing 767 : 2 moteurs seulement et perche de ravitaillement sous la queue.",
"Boeing P-8 Poseidon": "Boeing 737 militaire gris, avec très peu de hublots et des bouts d'ailes effilés vers l'arrière au lieu de winglets.",
"Northrop Grumman E-2 Hawkeye": "Petit avion de porte-avions à 2 hélices, radar en soucoupe sur le dos et 4 dérives verticales à l'arrière.",
"General Atomics MQ-9 Reaper": "Drone au nez bombé sans vitres, hélice à l'arrière (elle pousse au lieu de tirer) et empennage en Y.",
"Bell Boeing V-22 Osprey": "Convertible : 2 énormes rotors au bout des ailes qui basculent de la verticale (hélicoptère) à l'horizontale (avion).",
"Boeing CH-47 Chinook": "Gros hélicoptère à 2 rotors, un à l'avant et un à l'arrière, sans rotor de queue.",
"Airbus Helicopters Tigre": "Hélicoptère de combat très fin, 2 pilotes l'un derrière l'autre et petites ailes de chaque côté pour porter les armes.",
"Ilyouchine Il-76": "Cargo russe à ailes hautes, 4 réacteurs et dérive en T, avec un nez vitré sous le cockpit (poste du navigateur).",
"Airbus A380": "Le plus gros avion de ligne : 2 rangées de hublots sur toute la longueur (2 ponts), 4 moteurs et des ailes immenses.",
"Boeing 747-8": "Bosse à l'avant (pont supérieur), 4 moteurs au bord arrière dentelé et bouts d'ailes effilés vers l'arrière, sans winglets.",
"Airbus A330 MRTT": "A330 militaire gris avec une perche de ravitaillement sous la queue et des nacelles à tuyau sous les ailes.",
"Boeing 747-400": "Le « Jumbo » : bosse à l'avant (pont supérieur), 4 moteurs et winglets relevés au bout des ailes.",
"Airbus A340-600": "Le plus long des A340 : fuselage très allongé, 4 gros moteurs et une jambe de train centrale à 4 roues.",
"McDonnell Douglas MD-11": "Trimoteur : un moteur sous chaque aile et le troisième dans la dérive, winglets vers le haut ET vers le bas au bout des ailes.",
"Douglas DC-3": "Bimoteur à hélices des années 1930 à roulette de queue : au sol, il est « assis », le nez en l'air. Ailes basses aux bouts arrondis.",
"Junkers Ju 52": "Trimoteur à hélices en tôle ondulée (fuselage et ailes striés) : un moteur dans le nez et un sur chaque aile.",
"Supermarine Spitfire": "Chasseur à hélice de la Seconde Guerre mondiale, reconnaissable à ses ailes en ellipse parfaite aux bouts très arrondis.",
"North American P-51 Mustang": "Chasseur à hélice de la Seconde Guerre mondiale avec une grosse écope sous le ventre, ailes aux bouts carrés et verrière en bulle.",
"Diamond DA40": "Petit monomoteur à hélice aux ailes basses très longues et fines comme un planeur, dérive en T et grande verrière.",
"Diamond DA42": "Bimoteur léger aux ailes de planeur (longues et fines) à winglets, dérive en T et nez allongé.",
"Piper PA-28 Cherokee": "Petit monomoteur à hélice aux ailes basses, train fixe à 3 roues, empennage classique et cabine à porte unique du côté droit.",
"Cirrus SR22": "Monomoteur à hélice aux ailes basses et train fixe, capot effilé ; il emporte un parachute capable de freiner tout l'avion.",
"Socata TB-20 Trinidad": "Monomoteur français à ailes basses et train rentrant, portes papillon qui s'ouvrent vers le haut.",
"Tecnam P2008": "Petit biplace à hélice aux ailes hautes sans haubans, dérive en arrière d'un fuselage arrière très fin.",
"Cessna 152": "Tout petit biplace à hélice aux ailes hautes tenues par des haubans, train fixe : un mini Cessna 172.",
"Piper PA-34 Seneca": "Bimoteur léger à hélices aux ailes basses, un moteur sur chaque aile, train rentrant.",
"Beechcraft King Air": "Bimoteur à hélices (turbopropulseurs) aux ailes basses, dérive en T, hublots ronds : l'avion-taxi typique.",
"Embraer Phenom 300": "Jet d'affaires à 2 moteurs à l'arrière, dérive en T inclinée vers l'arrière et winglets.",
"Learjet 45": "Jet d'affaires effilé à 2 moteurs à l'arrière, dérive en T et winglets relevés.",
"Pilatus PC-24": "Jet d'affaires à 2 moteurs à l'arrière et dérive en T, au train robuste capable d'atterrir sur des pistes en herbe.",
"Airbus H160": "Hélicoptère moderne aux pales recourbées au bout (Blue Edge) et au fenestron incliné dans la queue.",
"Leonardo AW139": "Hélicoptère bimoteur à train rentrant, longue cabine à grandes portes coulissantes et rotor principal à 5 pales.",
"Airbus H125": "C'est l'Écureuil : hélicoptère léger à patins, cabine très vitrée et petit rotor de queue visible.",
"Bell 407": "Hélicoptère léger à patins et rotor à 4 pales ; sur la poutre de queue, un petit stabilisateur terminé par deux petites dérives.",
"Fokker 100": "Jet régional à 2 moteurs à l'arrière et dérive en T, sans winglets ; plus gros que le CRJ.",
"Boeing 717": "Jet de ligne à 2 moteurs à l'arrière et dérive en T : le dernier descendant du DC-9, au nez pointu."
},
"tipsByCode": [
[
[
"E135",
"E145",
"E35L",
"E45X"
],
"Jet régional Embraer ERJ : fuselage étroit, 2 moteurs à l'arrière, dérive en T et nez long et pointu."
],
[
[
"A306",
"A30B",
"A310"
],
"Airbus A300 / A310 : gros-porteur des débuts d'Airbus, 2 moteurs, sans winglets ou avec de petites pointes en bout d'aile, nez arrondi."
],
[
[
"B461",
"B462",
"B463",
"RJ70",
"RJ85",
"RJ1H"
],
"BAe 146 / Avro RJ : 4 petits réacteurs sous des ailes hautes et dérive en T."
],
[
[
"SF34",
"SB20"
],
"Saab 340 / 2000 : bimoteur à hélices aux ailes basses et au nez fin."
],
[
[
"D328",
"J328"
],
"Dornier 328 : ailes hautes, dérive en T et long fuselage fin."
],
[
[
"F70",
"F100"
],
"Fokker 70 / 100 : jet régional à 2 moteurs à l'arrière et dérive en T."
],
[
[
"C208"
],
"Cessna Caravan : gros monomoteur à hélice aux ailes hautes à haubans, train fixe."
],
[
[
"BE20",
"BE30",
"B350",
"BE9L"
],
"Beechcraft King Air : bimoteur à hélices aux ailes basses, souvent à dérive en T."
],
[
[
"P28A",
"P28B",
"P28R",
"P28T",
"PA28"
],
"Piper PA-28 : petit monomoteur à hélice aux ailes basses, train fixe."
],
[
[
"DA40",
"DV20"
],
"Diamond : petit avion à hélice aux ailes basses très fines comme un planeur, dérive en T."
],
[
[
"DA42",
"DA62"
],
"Diamond bimoteur : ailes de planeur à winglets, dérive en T."
],
[
[
"SR20",
"SR22",
"S22T"
],
"Cirrus : monomoteur à hélice aux ailes basses, train fixe, parachute intégré."
],
[
[
"E50P",
"E55P"
],
"Embraer Phenom : petit jet d'affaires à 2 moteurs à l'arrière et dérive en T inclinée."
],
[
[
"LJ31",
"LJ35",
"LJ40",
"LJ45",
"LJ60",
"LJ75"
],
"Learjet : jet d'affaires effilé à 2 moteurs à l'arrière, dérive en T."
],
[
[
"PC6T",
"PC6P"
],
"Pilatus Porter : monomoteur à hélice aux ailes hautes et au très long nez, capable de décoller sur quelques dizaines de mètres."
],
[
[
"PC24"
],
"Pilatus PC-24 : jet d'affaires à 2 moteurs à l'arrière et dérive en T."
],
[
[
"A109",
"A119"
],
"AgustaWestland AW109 / AW119 : hélicoptère fin et élancé au nez pointu, à train rentrant (AW109) ou à patins (AW119)."
],
[
[
"A139",
"A169",
"A189"
],
"Leonardo AW139 / AW169 / AW189 : hélicoptère bimoteur à train rentrant, cabine longue et rotor à 5 pales."
],
[
[
"EC30",
"EC20",
"H130"
],
"Airbus H130 / H120 : hélicoptère léger à patins avec un fenestron (rotor de queue caché dans un anneau)."
],
[
[
"H160"
],
"Airbus H160 : pales recourbées au bout et fenestron incliné dans la queue."
],
[
[
"S76"
],
"Sikorsky S-76 : hélicoptère au nez allongé et effilé, train rentrant."
],
[
[
"B06",
"B407",
"B427",
"B429"
],
"Bell : hélicoptère à patins ; sur la poutre de queue, un petit stabilisateur terminé par deux petites dérives."
],
[
[
"EC55",
"EC155",
"AS65",
"S365"
],
"Dauphin / H155 : hélicoptère au fenestron, train rentrant, silhouette fuselée."
],
[
[
"C150",
"C152"
],
"Cessna 150 / 152 : petit biplace aux ailes hautes à haubans, train fixe."
],
[
[
"C206",
"C207",
"C210"
],
"Cessna 206 / 210 : monomoteur à ailes hautes, plus gros que le 172."
]
],
"tipsByFamily": {
"MILITARY": "Pour un avion militaire, compte les moteurs et les dérives, regarde la forme des ailes (delta, en flèche, droites) et la présence d'une rampe arrière ou d'un radar sur le dos.",
"HELICOPTER": "Pour un hélicoptère, regarde les patins ou les roues, le rotor de queue (visible ou caché dans un anneau) et le nombre de pales.",
"BUSINESS": "Pour un jet d'affaires, regarde la forme des hublots, le nombre de moteurs à l'arrière (2 ou 3) et si la dérive est en T.",
"WIDEBODY": "Pour un gros-porteur, compte les moteurs (2 ou 4), cherche une bosse à l'avant et regarde le bout des ailes (winglets ou pointes effilées).",
"AIRLINER": "Pour un avion de ligne, regarde la forme du nez (arrondi ou pointu), la position des moteurs (sous les ailes ou à l'arrière) et le bout des ailes.",
"LIGHT": "Pour un petit avion, regarde si les ailes sont hautes ou basses, s'il a des haubans, un train fixe ou rentrant, et la forme de la dérive."
}
};
