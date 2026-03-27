# 🎮 NER Tower

**NER Tower** is a browser-based vertical platformer where gameplay is driven by Named Entity Recognition (NER) datasets.

Climb an endless tower built from text — but only land on the *right* entities.

---

## 🧠 Concept

The game transforms structured NLP data into gameplay:

* Each sentence becomes a vertical platform layout
* Named entities are **platforms**
* The player must learn which entity types are **safe**
* Difficulty increases dynamically as some entity types become **fallthrough**

👉 This creates a unique blend of:

* platforming skill
* pattern recognition
* data understanding

---

## 🛠️ Tech Stack

* **TypeScript**
* **Phaser 3**
* **Vite**
* **vite-plugin-singlefile**

---

## 🚀 Getting Started

```bash
git clone https://github.com/your-username/ner-tower.git
cd ner-tower
npm install
npm run dev
```

Open:

```
http://localhost:5173
```

---

## 📦 Build

```bash
npm run build
npm run preview
```

---

## 📂 Data Input (IMPORTANT)

This project **does NOT include datasets**.

You must provide your own JSON file via the in-game upload system.

---

## 🧾 Required Data Format

Your JSON must be an array of sentence objects:

```json
[
  {
    "id": "doc1-s1",
    "text": "Albert Einstein worked in Princeton.",
    "tokenized_text": ["Albert", "Einstein", "worked", "in", "Princeton", "."],
    "ner": [
      [0, 1, "PERSON"],
      [4, 4, "LOCATION"]
    ]
  }
]
```

### Field Explanation

* `id` → unique sentence identifier
* `text` → full sentence
* `tokenized_text` → array of tokens (must align with indices)
* `ner` → entity annotations:

```
[start_index, end_index, label]
```

Example:

```
[0, 1, "PERSON"]
```

→ tokens 0–1 (`Albert Einstein`) form a PERSON entity

---

## ⚠️ Data Requirements

* Indices must match `tokenized_text`
* Entities must not overlap incorrectly
* At least one valid entity per sentence is recommended

---

## 🎮 Gameplay Overview

* Move left/right and jump to climb
* Land on entity platforms
* Some entity types become **unstable** as difficulty increases
* Falling below the screen = game over

---

## 📈 Design Notes

* Level generation is **data-driven**
* Difficulty adapts based on dataset statistics
* The game ensures **at least one valid path** is always possible

---

## 🗺️ Roadmap (Simplified)

1. **Asset Structure:** Create a `public/assets/player/` folder and prepare transparent PNG layers (e.g., `body.png`, `eyes_4.png`, `hair_5.png`) so the game can stack them like paper dolls.
2. **Data Mapping:** Update the JSON loading logic in the `MainMenuScene` to extract the `annotator_id` (or use the filename as a proxy) and pass it into the `GameScene` via the `init()` data.
3. **Player Refactor:** In the `GameScene`, replace the `Phaser.GameObjects.Rectangle` player with a `Phaser.GameObjects.Container` that dynamically loads and displays the specific sprite layers tied to that ID.

**Pro-tip for tomorrow:** Add `public/assets/player/*` to your `.gitignore` file now. That way, you can keep the default BERT on GitHub but your annotators' "Easter Egg" sprites will stay strictly on your local machine.


---
