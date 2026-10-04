# Site vitrine — publicités vidéo IA

Site d'une page pour vendre des spots vidéo générés par IA aux entreprises de tous les pays francophones, avec la série TikTok AlexyaAI comme vitrine.

Style : inspiré de Stripe (fond blanc, encre bleu nuit, un seul indigo `#533afd` pour les actions, police fine, rayons de 4 px, aucune ombre). Aucune dépendance, aucun outil de build : trois fichiers.

| Fichier | Rôle |
|---|---|
| `index.html` | Contenu de la page (textes, sections, formulaire) |
| `styles.css` | Couleurs, typographie, mise en page, animations CSS |
| `main.js` | Animations au scroll, effets au survol, formulaire |

## Voir le site

Double-cliquez sur `index.html` : il s'ouvre dans votre navigateur. Rien à installer.

## Mettre en ligne (gratuit)

1. Allez sur <https://app.netlify.com/drop>.
2. Glissez le dossier du site dans la page.
3. Netlify vous donne une adresse en `.netlify.app`. Vous pourrez brancher votre propre nom de domaine ensuite.

## À remplacer avant de publier

Tout se trouve dans `index.html`. Utilisez la recherche (Ctrl+F) sur le texte indiqué.

| Quoi | Rechercher | Combien |
|---|---|---|
| Nom du studio (provisoire « aube studio ») | `studio` | 8 occurrences (la 9e, le titre de colonne « Studio » du pied de page, peut rester) |
| Adresse email | `contact@votre-domaine.fr` | 2 occurrences |
| Lien du compte TikTok AlexyaAI | `data-tiktok` (remplacer `https://www.tiktok.com/` par l'URL du compte) | 2 liens |
| Prix | `data-odometer` dans la section Tarifs | 3 prix |

Les engagements affichés sont des promesses que vous devrez tenir : livraison en 72 h, deux allers-retours, premier script offert, réponse sous 24 h. Modifiez-les si l'un d'eux n'est pas tenable.

### Obligations légales (France)

- **Mentions légales** : obligatoires sur tout site professionnel (loi LCEN). Il faut votre nom, votre statut, votre SIRET, une adresse de contact et le nom de l'hébergeur (Netlify si vous suivez la procédure ci-dessus). Ajoutez une section ou une page dédiée et un lien dans le pied de page.
- **TVA** : si vous êtes micro-entrepreneur en franchise de TVA, remplacez « HT » par la mention « TVA non applicable, art. 293 B du CGI ».
- **Clients hors de France** : les mentions de TVA sur vos factures changent selon que le client est dans l'Union européenne (Belgique, Luxembourg) ou en dehors (Suisse, Québec, Afrique). À vérifier auprès de l'URSSAF ou d'un comptable avant le premier client étranger. Les prix du site sont affichés en euros.

## Recevoir les demandes du formulaire

Par défaut, le formulaire n'envoie rien : il prépare le message du visiteur et lui propose de le copier ou de l'ouvrir dans sa messagerie. Pour recevoir les demandes directement :

- **Sur Netlify** : dans `index.html`, remplacez `data-endpoint=""` par `data-endpoint="/"`. Les demandes arrivent dans l'onglet *Forms* de Netlify, qui peut vous les transférer par email.
- **Ailleurs** : créez un formulaire gratuit sur <https://formspree.io>, puis collez l'adresse fournie dans `data-endpoint` (par exemple `data-endpoint="https://formspree.io/f/abcdwxyz"`).

Pour vérifier : envoyez une demande de test depuis le site en ligne. Le message « Demande envoyée » ne s'affiche que si le service a bien reçu la demande.

## Réservation d'appel

Le calendrier de la section Contact est une illustration animée : rien n'y est cliquable. Pour que les visiteurs réservent vraiment un créneau, créez un lien de prise de rendez-vous gratuit (Calendly ou Cal.com) et ajoutez un bouton qui y mène sous le calendrier.

## Animations

| Effet | Où |
|---|---|
| Grille de points qui réagit au curseur et aux clics | Hero (à gauche) |
| Mot qui défile dans le titre (restaurant, marque, hôtel…) | Hero |
| Réseau neuronal : les nœuds s'écartent et s'allument sous le curseur, les signaux traversent les couches, un clic déclenche une salve | Hero (à droite) |
| Titres qui montent mot par mot, filets qui se dessinent | Toutes les sections |
| Halo qui suit le curseur, filet indigo, icônes qui se redessinent | Cartes et tarifs |
| Compteurs à rouleaux | Chiffres et prix |
| Bande sombre, colonne collante, étape active, panneau qui change | Méthode |
| Défilement horizontal épinglé (ordinateur), glissé au doigt (mobile) | Exemples |
| Lecture simulée des scripts au survol | Exemples |
| Texte qui s'allume au fil du scroll, terminal qui s'écrit | Série |
| Curseur simulé qui choisit une date, une heure et confirme l'appel | Contact |
| Boutons aimantés, flèches qui avancent, pastille de menu qui glisse, barre qui passe en sombre au-dessus de la méthode | Navigation et boutons |

Les visiteurs qui ont activé « réduire les animations » sur leur appareil voient le site complet, sans mouvement.
