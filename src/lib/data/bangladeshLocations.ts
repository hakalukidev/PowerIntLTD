// Bangladesh administrative geography: Division -> District -> Thana/Upazila.
// Source: BBS district/upazila codes (nuhil/bangladesh-geocode), with Dhaka district
// extended to include Dhaka Metropolitan Police thanas alongside its rural upazilas.
export const bangladeshLocations: Record<string, Record<string, string[]>> = {
  "Dhaka": {
    "Dhaka": ["Adabor", "Airport", "Ashulia", "Badda", "Banani", "Bangshal", "Bimanbandar", "Cantonment", "Chackbazar", "Dakshinkhan", "Darus Salam", "Demra", "Dhamrai", "Dhanmondi", "Dohar", "Gendaria", "Gulshan", "Hazaribagh", "Jatrabari", "Kadamtali", "Kafrul", "Kalabagan", "Kamrangirchar", "Keraniganj", "Khilgaon", "Khilkhet", "Kotwali", "Lalbagh", "Mirpur", "Mohammadpur", "Motijheel", "Mugda", "Nawabganj", "New Market", "Pallabi", "Paltan", "Ramna", "Rampura", "Sabujbagh", "Savar", "Shah Ali", "Shahbagh", "Shahjahanpur", "Sher-e-Bangla Nagar", "Shyampur", "Sutrapur", "Tejgaon", "Tejgaon Industrial Area", "Turag", "Uttara", "Uttara West", "Uttarkhan", "Vatara", "Wari"],
    "Faridpur": ["Alfadanga", "Bhanga", "Boalmari", "Charbhadrasan", "Faridpur Sadar", "Madhukhali", "Nagarkanda", "Sadarpur", "Saltha"],
    "Gazipur": ["Gazipur Sadar", "Kaliakair", "Kaliganj", "Kapasia", "Sreepur"],
    "Gopalganj": ["Gopalganj Sadar", "Kashiani", "Kotalipara", "Muksudpur", "Tungipara"],
    "Kishoreganj": ["Austagram", "Bajitpur", "Bhairab", "Hossainpur", "Itna", "Karimgonj", "Katiadi", "Kishoreganj Sadar", "Kuliarchar", "Mithamoin", "Nikli", "Pakundia", "Tarail"],
    "Madaripur": ["Dasar", "Kalkini", "Madaripur Sadar", "Rajoir", "Shibchar"],
    "Manikganj": ["Doulatpur", "Gior", "Harirampur", "Manikganj Sadar", "Saturia", "Shibaloy", "Singiar"],
    "Munshiganj": ["Gajaria", "Louhajanj", "Munshiganj Sadar", "Sirajdikhan", "Sreenagar", "Tongibari"],
    "Narayanganj": ["Araihazar", "Bandar", "Narayanganj Sadar", "Rupganj", "Sonargaon"],
    "Narsingdi": ["Belabo", "Monohardi", "Narsingdi Sadar", "Palash", "Raipura", "Shibpur"],
    "Rajbari": ["Baliakandi", "Goalanda", "Kalukhali", "Pangsa", "Rajbari Sadar"],
    "Shariatpur": ["Bhedarganj", "Damudya", "Gosairhat", "Naria", "Shariatpur Sadar", "Zajira"],
    "Tangail": ["Basail", "Bhuapur", "Delduar", "Dhanbari", "Ghatail", "Gopalpur", "Kalihati", "Madhupur", "Mirzapur", "Nagarpur", "Sakhipur", "Tangail Sadar"],
  },
  "Chattogram": {
    "Bandarban": ["Alikadam", "Bandarban Sadar", "Lama", "Naikhongchhari", "Rowangchhari", "Ruma", "Thanchi"],
    "Brahmanbaria": ["Akhaura", "Ashuganj", "Bancharampur", "Bijoynagar", "Brahmanbaria Sadar", "Kasba", "Nabinagar", "Nasirnagar", "Sarail"],
    "Chandpur": ["Chandpur Sadar", "Faridgonj", "Haimchar", "Hajiganj", "Kachua", "Matlab North", "Matlab South", "Shahrasti"],
    "Chattogram": ["Anwara", "Banshkhali", "Boalkhali", "Chandanaish", "Fatikchhari", "Hathazari", "Karnafuli", "Lohagara", "Mirsharai", "Patiya", "Rangunia", "Raozan", "Sandwip", "Satkania", "Sitakunda"],
    "Comilla": ["Barura", "Brahmanpara", "Burichang", "Chandina", "Chauddagram", "Comilla Sadar", "Daudkandi", "Debidwar", "Homna", "Laksam", "Lalmai", "Meghna", "Monohargonj", "Muradnagar", "Nangalkot", "Sadarsouth", "Titas"],
    "Cox's Bazar": ["Chakaria", "Coxsbazar Sadar", "Eidgaon", "Kutubdia", "Moheshkhali", "Pekua", "Ramu", "Teknaf", "Ukhiya"],
    "Feni": ["Chhagalnaiya", "Daganbhuiyan", "Feni Sadar", "Fulgazi", "Parshuram", "Sonagazi"],
    "Khagrachhari": ["Dighinala", "Guimara", "Khagrachhari Sadar", "Laxmichhari", "Manikchari", "Matiranga", "Mohalchari", "Panchari", "Ramgarh"],
    "Lakshmipur": ["Kamalnagar", "Lakshmipur Sadar", "Raipur", "Ramganj", "Ramgati"],
    "Noakhali": ["Begumganj", "Chatkhil", "Companiganj", "Hatia", "Kabirhat", "Noakhali Sadar", "Senbug", "Sonaimori", "Subarnachar"],
    "Rangamati": ["Baghaichari", "Barkal", "Belaichari", "Juraichari", "Kaptai", "Kawkhali", "Langadu", "Naniarchar", "Rajasthali", "Rangamati Sadar"],
  },
  "Rajshahi": {
    "Bogura": ["Adamdighi", "Bogra Sadar", "Dhunot", "Dupchanchia", "Gabtali", "Kahaloo", "Nondigram", "Shajahanpur", "Shariakandi", "Sherpur", "Shibganj", "Sonatala"],
    "Chapainawabganj": ["Bholahat", "Chapainawabganj Sadar", "Gomostapur", "Nachol", "Shibganj"],
    "Joypurhat": ["Akkelpur", "Joypurhat Sadar", "Kalai", "Khetlal", "Panchbibi"],
    "Naogaon": ["Atrai", "Badalgachi", "Dhamoirhat", "Manda", "Mohadevpur", "Naogaon Sadar", "Niamatpur", "Patnitala", "Porsha", "Raninagar", "Sapahar"],
    "Natore": ["Bagatipara", "Baraigram", "Gurudaspur", "Lalpur", "Naldanga", "Natore Sadar", "Singra"],
    "Pabna": ["Atghoria", "Bera", "Bhangura", "Chatmohar", "Faridpur", "Ishurdi", "Pabna Sadar", "Santhia", "Sujanagar"],
    "Rajshahi": ["Bagha", "Bagmara", "Charghat", "Durgapur", "Godagari", "Mohonpur", "Paba", "Puthia", "Tanore"],
    "Sirajganj": ["Belkuchi", "Chauhali", "Kamarkhand", "Kazipur", "Raigonj", "Shahjadpur", "Sirajganj Sadar", "Tarash", "Ullapara"],
  },
  "Khulna": {
    "Bagerhat": ["Bagerhat Sadar", "Chitalmari", "Fakirhat", "Kachua", "Mollahat", "Mongla", "Morrelganj", "Rampal", "Sarankhola"],
    "Chuadanga": ["Alamdanga", "Chuadanga Sadar", "Damurhuda", "Jibannagar"],
    "Jashore": ["Abhaynagar", "Bagherpara", "Chougachha", "Jessore Sadar", "Jhikargacha", "Keshabpur", "Manirampur", "Sharsha"],
    "Jhenaidah": ["Harinakundu", "Jhenaidah Sadar", "Kaliganj", "Kotchandpur", "Moheshpur", "Shailkupa"],
    "Khulna": ["Botiaghata", "Dakop", "Digholia", "Dumuria", "Fultola", "Koyra", "Paikgasa", "Rupsha", "Terokhada"],
    "Kushtia": ["Bheramara", "Daulatpur", "Khoksa", "Kumarkhali", "Kushtia Sadar", "Mirpur"],
    "Magura": ["Magura Sadar", "Mohammadpur", "Shalikha", "Sreepur"],
    "Meherpur": ["Gangni", "Meherpur Sadar", "Mujibnagar"],
    "Narail": ["Kalia", "Lohagara", "Narail Sadar"],
    "Satkhira": ["Assasuni", "Debhata", "Kalaroa", "Kaliganj", "Satkhira Sadar", "Shyamnagar", "Tala"],
  },
  "Barishal": {
    "Barguna": ["Amtali", "Bamna", "Barguna Sadar", "Betagi", "Pathorghata", "Taltali"],
    "Barisal": ["Agailjhara", "Babuganj", "Bakerganj", "Banaripara", "Barisal Sadar", "Gournadi", "Hizla", "Mehendiganj", "Muladi", "Wazirpur"],
    "Bhola": ["Bhola Sadar", "Borhan Sddin", "Charfesson", "Doulatkhan", "Lalmohan", "Monpura", "Tazumuddin"],
    "Jhalokati": ["Jhalakathi Sadar", "Kathalia", "Nalchity", "Rajapur"],
    "Patuakhali": ["Bauphal", "Dashmina", "Dumki", "Galachipa", "Kalapara", "Mirzaganj", "Patuakhali Sadar", "Rangabali"],
    "Pirojpur": ["Bhandaria", "Kawkhali", "Mathbaria", "Nazirpur", "Nesarabad", "Pirojpur Sadar", "Zianagar"],
  },
  "Sylhet": {
    "Habiganj": ["Ajmiriganj", "Bahubal", "Baniachong", "Chunarughat", "Habiganj Sadar", "Lakhai", "Madhabpur", "Nabiganj"],
    "Moulvibazar": ["Barlekha", "Juri", "Kamolganj", "Kulaura", "Moulvibazar Sadar", "Rajnagar", "Sreemangal"],
    "Sunamganj": ["Bishwambarpur", "Chhatak", "Derai", "Dharmapasha", "Dowarabazar", "Jagannathpur", "Jamalganj", "Madhyanagar", "Shalla", "South Sunamganj", "Sunamganj Sadar", "Tahirpur"],
    "Sylhet": ["Balaganj", "Beanibazar", "Bishwanath", "Companiganj", "Dakshinsurma", "Fenchuganj", "Golapganj", "Gowainghat", "Jaintiapur", "Kanaighat", "Osmaninagar", "Sylhet Sadar", "Zakiganj"],
  },
  "Rangpur": {
    "Dinajpur": ["Birampur", "Birganj", "Birol", "Bochaganj", "Chirirbandar", "Dinajpur Sadar", "Fulbari", "Ghoraghat", "Hakimpur", "Kaharol", "Khansama", "Nawabganj", "Parbatipur"],
    "Gaibandha": ["Gaibandha Sadar", "Gobindaganj", "Palashbari", "Phulchari", "Sadullapur", "Saghata", "Sundarganj"],
    "Kurigram": ["Bhurungamari", "Charrajibpur", "Chilmari", "Kurigram Sadar", "Nageshwari", "Phulbari", "Rajarhat", "Rowmari", "Ulipur"],
    "Lalmonirhat": ["Aditmari", "Hatibandha", "Kaliganj", "Lalmonirhat Sadar", "Patgram"],
    "Nilphamari": ["Dimla", "Domar", "Jaldhaka", "Kishorganj", "Nilphamari Sadar", "Syedpur"],
    "Panchagarh": ["Atwari", "Boda", "Debiganj", "Panchagarh Sadar", "Tetulia"],
    "Rangpur": ["Badargonj", "Gangachara", "Kaunia", "Mithapukur", "Pirgacha", "Pirgonj", "Rangpur Sadar", "Taragonj"],
    "Thakurgaon": ["Baliadangi", "Haripur", "Pirganj", "Ranisankail", "Thakurgaon Sadar"],
  },
  "Mymensingh": {
    "Jamalpur": ["Bokshiganj", "Dewangonj", "Islampur", "Jamalpur Sadar", "Madarganj", "Melandah", "Sarishabari"],
    "Mymensingh": ["Bhaluka", "Dhobaura", "Fulbaria", "Gafargaon", "Gouripur", "Haluaghat", "Iswarganj", "Muktagacha", "Mymensingh Sadar", "Nandail", "Phulpur", "Tarakanda", "Trishal"],
    "Netrokona": ["Atpara", "Barhatta", "Durgapur", "Kalmakanda", "Kendua", "Khaliajuri", "Madan", "Mohongonj", "Netrokona Sadar", "Purbadhala"],
    "Sherpur": ["Jhenaigati", "Nalitabari", "Nokla", "Sherpur Sadar", "Sreebordi"],
  },
}

export const divisionList = Object.keys(bangladeshLocations)

export function districtsForDivision(division: string): string[] {
  return Object.keys(bangladeshLocations[division] ?? {})
}

export function thanasForDistrict(division: string, district: string): string[] {
  return bangladeshLocations[division]?.[district] ?? []
}

export function findDivisionForDistrict(district: string): string | undefined {
  return Object.entries(bangladeshLocations).find(([, dists]) => district in dists)?.[0]
}
