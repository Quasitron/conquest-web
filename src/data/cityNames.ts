export type NameRegion = 'europe' | 'northAmerica' | 'latinAmerica' | 'asia' | 'africaMiddleEast' | 'oceania';

export const NAME_REGIONS: readonly NameRegion[] = [
  'europe', 'northAmerica', 'latinAmerica', 'asia', 'africaMiddleEast', 'oceania',
];

const EUROPE = [
  'London', 'Paris', 'Berlin', 'Madrid', 'Rome', 'Vienna', 'Prague', 'Warsaw', 'Budapest', 'Lisbon',
  'Dublin', 'Edinburgh', 'Glasgow', 'Manchester', 'Liverpool', 'Birmingham', 'Bristol', 'Leeds', 'Cardiff', 'Belfast',
  'Amsterdam', 'Rotterdam', 'Brussels', 'Antwerp', 'Bruges', 'Luxembourg', 'Geneva', 'Zurich', 'Basel', 'Bern',
  'Munich', 'Hamburg', 'Cologne', 'Frankfurt', 'Stuttgart', 'Dresden', 'Leipzig', 'Bremen', 'Hanover', 'Nuremberg',
  'Marseille', 'Lyon', 'Toulouse', 'Nice', 'Nantes', 'Bordeaux', 'Lille', 'Strasbourg', 'Rennes', 'Dijon',
  'Barcelona', 'Valencia', 'Seville', 'Bilbao', 'Malaga', 'Granada', 'Zaragoza', 'Toledo', 'Porto', 'Coimbra',
  'Milan', 'Naples', 'Turin', 'Florence', 'Venice', 'Genoa', 'Bologna', 'Palermo', 'Verona', 'Pisa',
  'Athens', 'Thessaloniki', 'Sofia', 'Bucharest', 'Belgrade', 'Zagreb', 'Sarajevo', 'Ljubljana', 'Skopje', 'Tirana',
  'Stockholm', 'Gothenburg', 'Malmo', 'Oslo', 'Bergen', 'Trondheim', 'Copenhagen', 'Aarhus', 'Helsinki', 'Tampere',
  'Reykjavik', 'Riga', 'Tallinn', 'Vilnius', 'Kaunas', 'Krakow', 'Gdansk', 'Wroclaw', 'Poznan', 'Lodz',
  'Bratislava', 'Kosice', 'Brno', 'Graz', 'Salzburg', 'Innsbruck', 'Linz', 'Debrecen', 'Szeged', 'Pecs',
  'Kyiv', 'Lviv', 'Odesa', 'Minsk', 'Chisinau', 'Moscow', 'Kazan', 'Samara', 'Novgorod', 'Smolensk',
  'Murmansk', 'Archangel', 'Valletta', 'Split', 'Dubrovnik', 'Kotor', 'Cork', 'Galway', 'Aberdeen', 'Inverness',
  'Plymouth', 'Oxford', 'Cambridge', 'York', 'Canterbury', 'Brest', 'Cadiz', 'Vigo', 'Trieste', 'Salerno',
];

const NORTH_AMERICA = [
  'New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Philadelphia', 'San Diego', 'Dallas', 'Austin', 'Seattle',
  'Denver', 'Boston', 'Portland', 'Detroit', 'Memphis', 'Nashville', 'Atlanta', 'Miami', 'Tampa', 'Orlando',
  'Charlotte', 'Raleigh', 'Richmond', 'Baltimore', 'Pittsburgh', 'Cleveland', 'Columbus', 'Cincinnati', 'Indianapolis', 'Milwaukee',
  'Minneapolis', 'Omaha', 'Kansas City', 'St Louis', 'Tulsa', 'Oklahoma City', 'Albuquerque', 'Santa Fe', 'Tucson', 'Las Vegas',
  'Reno', 'Sacramento', 'San Francisco', 'San Jose', 'Oakland', 'Fresno', 'Spokane', 'Boise', 'Salt Lake City', 'Cheyenne',
  'Billings', 'Fargo', 'Sioux Falls', 'Des Moines', 'Madison', 'Buffalo', 'Rochester', 'Albany', 'Hartford', 'Providence',
  'Burlington', 'Bangor', 'Savannah', 'Charleston', 'Jacksonville', 'Huntsville', 'Mobile', 'New Orleans', 'Baton Rouge', 'Little Rock',
  'Louisville', 'Lexington', 'Knoxville', 'Honolulu', 'Anchorage', 'Fairbanks', 'Juneau', 'San Antonio', 'El Paso', 'Santa Barbara',
  'Toronto', 'Montreal', 'Vancouver', 'Calgary', 'Edmonton', 'Ottawa', 'Winnipeg', 'Quebec City', 'Halifax', 'Victoria',
  'Regina', 'Saskatoon', 'Saint John', 'Moncton', 'Fredericton', 'Charlottetown', 'Whitehorse', 'Yellowknife', 'Iqaluit', 'Thunder Bay',
  'Hamilton', 'Windsor', 'Kingston', 'Sudbury', 'Kelowna', 'Nanaimo', 'Lethbridge', 'Red Deer', 'Brandon', 'Gander',
  'Mexico City', 'Guadalajara', 'Monterrey', 'Puebla', 'Tijuana', 'Merida', 'Oaxaca', 'Veracruz', 'Acapulco', 'Cancun',
  'Chihuahua', 'Hermosillo', 'Mazatlan', 'Morelia', 'Toluca', 'Queretaro', 'Leon', 'Saltillo', 'Tampico', 'La Paz',
  'Havana', 'Santiago de Cuba', 'Montego Bay', 'Nassau', 'Port-au-Prince', 'Santo Domingo', 'San Juan', 'Bridgetown', 'Belize City', 'Guatemala City',
];

const LATIN_AMERICA = [
  'Buenos Aires', 'Cordoba', 'Rosario', 'Mendoza', 'Salta', 'Ushuaia', 'Bariloche', 'La Plata', 'Tucuman', 'Mar del Plata',
  'Sao Paulo', 'Rio de Janeiro', 'Brasilia', 'Salvador', 'Recife', 'Fortaleza', 'Belem', 'Manaus', 'Curitiba', 'Porto Alegre',
  'Belo Horizonte', 'Natal', 'Florianopolis', 'Goiania', 'Santos', 'Campinas', 'Vitoria', 'Cuiaba', 'Macapa', 'Joao Pessoa',
  'Santiago', 'Valparaiso', 'Concepcion', 'Antofagasta', 'Punta Arenas', 'Temuco', 'Iquique', 'Arica', 'Valdivia', 'La Serena',
  'Lima', 'Cusco', 'Arequipa', 'Trujillo', 'Iquitos', 'Chiclayo', 'Piura', 'Puno', 'Callao', 'Huancayo',
  'Bogota', 'Medellin', 'Cali', 'Cartagena', 'Barranquilla', 'Bucaramanga', 'Cucuta', 'Pereira', 'Santa Marta', 'Manizales',
  'Caracas', 'Maracaibo', 'Puerto La Cruz', 'Barquisimeto', 'Cumana', 'Ciudad Bolivar', 'Maturin', 'Quito', 'Guayaquil', 'Cuenca',
  'Tarija', 'Santa Cruz', 'Cochabamba', 'Sucre', 'Potosi', 'Oruro', 'Asuncion', 'Encarnacion', 'Montevideo', 'Punta del Este',
  'Colonia', 'Paysandu', 'Georgetown', 'Paramaribo', 'Cayenne', 'Cartago', 'San Salvador', 'Tegucigalpa', 'Managua', 'Panama City',
  'Colon', 'David', 'Masaya', 'Chinandega', 'San Pedro Sula', 'Puerto Limon', 'Quetzaltenango', 'Antigua', 'Port of Spain', 'Castries',
  'Puerto Montt', 'Chiloe', 'Rancagua', 'Talca', 'Copiapo', 'Calama', 'Neuquen', 'Bahia Blanca', 'Comodoro Rivadavia', 'Rio Gallegos',
  'Resistencia', 'Corrientes', 'Posadas', 'Parana', 'Chimbote', 'Jujuy', 'Ibague', 'Popayan', 'Pasto', 'Tunja',
  'Villavicencio', 'Riohacha', 'Monteria', 'Sincelejo', 'Ambato', 'Loja', 'Manta', 'Machala', 'Esmeraldas', 'Tacna',
];

const ASIA = [
  'Tokyo', 'Osaka', 'Kyoto', 'Nagoya', 'Sapporo', 'Fukuoka', 'Hiroshima', 'Kobe', 'Sendai', 'Nagasaki',
  'Yokohama', 'Kanazawa', 'Naha', 'Nara', 'Beijing', 'Shanghai', 'Guangzhou', 'Shenzhen', 'Chengdu', 'Wuhan',
  'Xian', 'Nanjing', 'Hangzhou', 'Tianjin', 'Chongqing', 'Harbin', 'Shenyang', 'Dalian', 'Qingdao', 'Kunming',
  'Lhasa', 'Urumqi', 'Lanzhou', 'Hong Kong', 'Macau', 'Taipei', 'Kaohsiung', 'Seoul', 'Busan', 'Incheon',
  'Daegu', 'Pyongyang', 'Ulaanbaatar', 'Bangkok', 'Chiang Mai', 'Phuket', 'Hanoi', 'Hue', 'Da Nang', 'Saigon',
  'Haiphong', 'Vientiane', 'Phnom Penh', 'Siem Reap', 'Yangon', 'Mandalay', 'Naypyidaw', 'Kuala Lumpur', 'Penang', 'Malacca',
  'Singapore', 'Jakarta', 'Surabaya', 'Bandung', 'Medan', 'Denpasar', 'Makassar', 'Manila', 'Cebu', 'Davao',
  'Delhi', 'Mumbai', 'Kolkata', 'Chennai', 'Bangalore', 'Hyderabad', 'Pune', 'Jaipur', 'Lucknow', 'Agra',
  'Varanasi', 'Ahmedabad', 'Surat', 'Kochi', 'Goa', 'Amritsar', 'Patna', 'Bhopal', 'Nagpur', 'Madurai',
  'Karachi', 'Lahore', 'Islamabad', 'Peshawar', 'Quetta', 'Dhaka', 'Chittagong', 'Colombo', 'Kandy', 'Galle',
  'Kathmandu', 'Pokhara', 'Thimphu', 'Male', 'Kabul', 'Kandahar', 'Herat', 'Tashkent', 'Samarkand', 'Bukhara',
  'Almaty', 'Astana', 'Bishkek', 'Dushanbe', 'Ashgabat', 'Vladivostok', 'Irkutsk', 'Novosibirsk', 'Yakutsk', 'Khabarovsk',
  'Omsk', 'Tomsk', 'Krasnoyarsk', 'Magadan', 'Baku', 'Tbilisi', 'Yerevan', 'Batumi', 'Bandar Seri Begawan', 'Palembang',
];

const AFRICA_MIDDLE_EAST = [
  'Cairo', 'Alexandria', 'Giza', 'Luxor', 'Aswan', 'Port Said', 'Suez', 'Tripoli', 'Benghazi', 'Tunis',
  'Sfax', 'Algiers', 'Oran', 'Constantine', 'Casablanca', 'Rabat', 'Marrakesh', 'Fez', 'Tangier', 'Agadir',
  'Nouakchott', 'Dakar', 'Bamako', 'Timbuktu', 'Conakry', 'Freetown', 'Monrovia', 'Abidjan', 'Accra', 'Kumasi',
  'Lome', 'Cotonou', 'Lagos', 'Abuja', 'Kano', 'Ibadan', 'Port Harcourt', 'Niamey', 'Ouagadougou', 'Ndjamena',
  'Khartoum', 'Omdurman', 'Juba', 'Asmara', 'Addis Ababa', 'Djibouti', 'Mogadishu', 'Hargeisa', 'Nairobi', 'Mombasa',
  'Kampala', 'Kigali', 'Bujumbura', 'Dodoma', 'Dar es Salaam', 'Zanzibar', 'Arusha', 'Lusaka', 'Harare', 'Bulawayo',
  'Maputo', 'Beira', 'Lilongwe', 'Blantyre', 'Antananarivo', 'Windhoek', 'Gaborone', 'Johannesburg', 'Cape Town', 'Durban',
  'Pretoria', 'Port Elizabeth', 'Bloemfontein', 'Luanda', 'Kinshasa', 'Lubumbashi', 'Brazzaville', 'Libreville', 'Yaounde', 'Douala',
  'Bangui', 'Malabo', 'Banjul', 'Praia', 'Mahe', 'Port Louis', 'Moroni', 'Maseru', 'Mbabane', 'Kisumu',
  'Istanbul', 'Ankara', 'Izmir', 'Antalya', 'Trabzon', 'Konya', 'Adana', 'Bursa', 'Jerusalem', 'Tel Aviv',
  'Haifa', 'Beirut', 'Damascus', 'Aleppo', 'Amman', 'Aqaba', 'Baghdad', 'Basra', 'Mosul', 'Tehran',
  'Isfahan', 'Shiraz', 'Tabriz', 'Mashhad', 'Riyadh', 'Jeddah', 'Mecca', 'Medina', 'Dammam', 'Kuwait City',
  'Doha', 'Manama', 'Abu Dhabi', 'Dubai', 'Muscat', 'Salalah', 'Sanaa', 'Aden', 'Nicosia', 'Tobruk',
];

const OCEANIA = [
  'Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Adelaide', 'Canberra', 'Hobart', 'Darwin', 'Cairns', 'Townsville',
  'Alice Springs', 'Broome', 'Geelong', 'Newcastle', 'Wollongong', 'Ballarat', 'Bendigo', 'Launceston', 'Mackay', 'Rockhampton',
  'Toowoomba', 'Mildura', 'Esperance', 'Kalgoorlie', 'Geraldton', 'Port Hedland', 'Mount Isa', 'Gladstone', 'Bunbury', 'Fremantle',
  'Wagga Wagga', 'Dubbo', 'Tamworth', 'Armidale', 'Coffs Harbour', 'Byron Bay', 'Cooktown', 'Bundaberg', 'Orange', 'Devonport',
  'Auckland', 'Wellington', 'Christchurch', 'Dunedin', 'Masterton', 'Tauranga', 'Napier', 'Nelson', 'Queenstown', 'Invercargill',
  'Rotorua', 'Whangarei', 'Palmerston North', 'New Plymouth', 'Timaru', 'Gisborne', 'Greymouth', 'Blenheim', 'Oamaru', 'Taupo',
  'Suva', 'Nadi', 'Lautoka', 'Labasa', 'Port Moresby', 'Lae', 'Rabaul', 'Madang', 'Honiara', 'Gizo',
  'Port Vila', 'Luganville', 'Noumea', 'Papeete', 'Bora Bora', 'Apia', 'Nukualofa', 'Funafuti', 'Tarawa', 'Majuro',
  'Palikir', 'Koror', 'Hagatna', 'Saipan', 'Yaren', 'Avarua', 'Alofi', 'Pago Pago', 'Hilo', 'Lahaina',
  'Kailua', 'Wailuku', 'Lihue', 'Kona', 'Kahului', 'Moorea', 'Rarotonga', 'Vavau', 'Levuka', 'Savusavu',
  'Kokopo', 'Wewak', 'Goroka', 'Mount Hagen', 'Kieta', 'Buka', 'Auki', 'Munda', 'Lenakel', 'Mata-Utu',
  'Mount Gambier', 'Whyalla', 'Gympie', 'Betio', 'Ebeye', 'Kwajalein', 'Moree', 'Pohnpei', 'Kosrae', 'Colac',
  'Horsham', 'Traralgon', 'Warrnambool', 'Norfolk Island', 'Lord Howe', 'Katherine', 'Burnie', 'Strahan', 'Wynyard', 'Ulverstone',
];

const make = (names: string[], region: NameRegion) => names.map((name) => ({ name, region }));

export const CITY_NAMES: readonly { name: string; region: NameRegion }[] = [
  ...make(EUROPE, 'europe'),
  ...make(NORTH_AMERICA, 'northAmerica'),
  ...make(LATIN_AMERICA, 'latinAmerica'),
  ...make(ASIA, 'asia'),
  ...make(AFRICA_MIDDLE_EAST, 'africaMiddleEast'),
  ...make(OCEANIA, 'oceania'),
];
