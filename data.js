// Listes fixes de l'app : boutons, défis, places et rappels.
// Ce fichier sert aussi au script des rappels automatiques.
self.JS_DATA = {
  extras: [
    ["lift", "J'ai un lift (3 places)", "lift 3 places"],
    ["retard", "J'arrive en retard", "en retard"],
    ["plusun", "J'amène quelqu'un", "+1"],
    ["biere", "J'apporte la bière", "apporte la bière"],
    ["tonight", "Tonight is the night", "tonight is the night"],
    ["mush", "On mush la place", "on mush la place"],
    ["dos", "J'ai mal au dos", "a mal au dos"],
    ["noir", "Ça va être tout noir!", "ça va être tout noir!"]
  ],

  defis: [
    "Commande un plat que t'as jamais goûté",
    "Cellulaires dans le milieu de la table : le premier qui touche au sien paie les nachos",
    "Le dernier arrivé paie la première tournée",
    "Chacun raconte sa meilleure histoire de la semaine en une minute",
    "Trinque dans une langue différente à chaque tournée",
    "Laisse ton voisin de gauche choisir ton plat",
    "Personne ne parle de job avant le dessert",
    "Chacun amène une suggestion de place jamais essayée"
  ],

  hardcore: [
    "Chante une toune au karaoké, seul, devant toute la place",
    "Commande le plat le plus épicé du menu et finis-le au complet",
    "Parle avec un accent de France toute la soirée, sans casser",
    "La gang choisit ta photo de profil Facebook pour une semaine",
    "Laisse la gang commander ton repas, sans droit de veto",
    "Fais un discours de remerciement de deux minutes, debout, avant le repas",
    "Appelle ta mère en haut-parleur pour lui dire que tu l'aimes",
    "Porte toute la soirée l'accessoire que la gang choisit",
    "Perds au roche-papier-ciseaux contre le capitaine et tu paies les nachos",
    "Va complimenter le chandail d'un inconnu, avec un air sérieux"
  ],

  spots: {
    "Resto": [
      ["Auguste", "Une institution : des classiques québécois revisités"],
      ["Baumann", "Des plats à partager au centre-ville"],
      ["L'Empreinte", "Cuisine du marché, seulement 24 places : réserve"],
      ["Masala Café", "Cuisine indienne parfumée, décor coloré"],
      ["Boefish", "Le steakhouse de la ville"],
      ["Antidote FoodLab", "Parmi les mieux notés de Sherbrooke"],
      ["Le Chou-Bruxelles", "Moules, frites et bières belges"],
      ["Louis Luncheonette", "Le classique pour un déjeuner de lendemain de veille"]
    ],
    "Bar": [
      ["Boquébière", "Microbrasserie sur Wellington Nord, menu bistro"],
      ["Siboire", "Microbrasserie, bières maison"],
      ["La Mare au Diable", "Microbrasserie du centre-ville"],
      ["Le Vin Polisson", "Bar à vin sur King Ouest"]
    ],
    "Activité": [
      ["La Zone Plus", "Escape game, réalité virtuelle et lancer de hache"],
      ["Fox in a Box", "Salles d'évasion, puis jeux de société au bistro"],
      ["Escaparium", "Jeux d'évasion de niveau élevé, parfait en gang"],
      ["Kinzo", "Jeux immersifs en équipe"],
      ["Mont Bellevue", "Rando ou ski de soirée en ville"],
      ["Lac-des-Nations", "Tour du lac à pied avant le souper"]
    ]
  },

  // [clé, heure locale le jeudi (null = dès que ça lève), libellé, actif par défaut]
  reminders: [
    ["rsvp", 9, "Confirme ta présence pour ce soir", true],
    ["leve", null, "Le jeudi est confirmé", true],
    ["vote", 16, "Vote pour l'endroit", true],
    ["lift", 18, "Qui a besoin d'un lift", false],
    ["ou", 19, "On va où et à quelle heure", true]
  ]
};
