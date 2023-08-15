import { WwnDice } from "../dice.js";
import { WwnItem } from "../item/entity.js";

// SWB custom attributes support
import { EntitySheetHelper } from "./swb-helper.js";

export class WwnActor extends Actor {
  /**
   * Extends data from base Actor class
   */
   
   
   /*  
     Added for SWB custom attribute support
   */

  getRollData() {

    // Copy the actor's system data
    const data = this.toObject(false).data;
    const shorthand = game.settings.get("wwn", "macroShorthand");
    const formulaAttributes = [];
    const itemAttributes = [];

    // Handle formula attributes when the short syntax is disabled.
    this._applyShorthand(data, formulaAttributes, shorthand);

    // Map all items data using their slugified names
    //this._applyItems(data, itemAttributes, shorthand);

    // Evaluate formula replacements on items.
    //this._applyItemsFormulaReplacements(data, itemAttributes, shorthand);

    // Evaluate formula attributes after all other attributes have been handled, including items.
    this._applyFormulaReplacements(data, formulaAttributes, shorthand);

    // Remove the attributes if necessary.
    if ( !!shorthand ) {
      delete data.attributes;
      delete data.attr;
      delete data.groups;
    }
    return data;
  }


   /**/

  prepareData() {
    super.prepareData();
    const data = this.data.data;

    if (this.data.type === "faction" || this.data.type === "location") {
      return;
    }

    // Compute modifiers from actor scores
    this.computeModifiers();
    this.computeAC();
    this.computeEncumbrance();
    this._calculateMovement();
    this.computeTreasure();
    this.computeEffort();
    this.computeSaves();
    this.computeTotalSP();
    this.setXP();
    this.computePrepared();
    this.computeInit();
	
	// Added for SWB custom attributes
	this.data.data.groups = this.data.data.groups || {};
    this.data.data.attributes = this.data.data.attributes || {};
    EntitySheetHelper.clampResourceValues(this.data.data.attributes);

  }

  async createEmbeddedDocuments(embeddedName, data = [], context = {}) {
    data.map((item) => {
      if (item.img === undefined) {
        item.img = WwnItem.defaultIcons[item.type];
      }
    });
    return super.createEmbeddedDocuments(embeddedName, data, context);
  }

  /* -------------------------------------------- */
  /*  Socket Listeners and Handlers
    /* -------------------------------------------- */
  getExperience(value, options = {}) {
    if (this.data.type != "character") {
      return;
    }
    let modified = Math.floor(
      value + (this.data.data.details.xp.bonus * value) / 100
    );
    return this.update({
      "data.details.xp.value": modified + this.data.data.details.xp.value,
    }).then(() => {
      const speaker = ChatMessage.getSpeaker({ actor: this });
      ChatMessage.create({
        content: game.i18n.format("WWN.messages.GetExperience", {
          name: this.name,
          value: modified,
        }),
        speaker,
      });
    });
  }

  getBank(value, options = {}) {
    if (this.data.type != "character") {
      return;
    }
    return this.update({
      "data.currency.bank": value + this.data.data.currency.bank,
    }).then(() => {
      const speaker = ChatMessage.getSpeaker({ actor: this });
      ChatMessage.create({
        content: game.i18n.format("WWN.messages.GetCurrency", {
          name: this.name,
          value,
        }),
        speaker,
      });
    });
  }

  isNew() {
    const data = this.data.data;
    if (this.data.type == "character") {
      let ct = 0;
      Object.values(data.scores).forEach((el) => {
        ct += el.value;
      });
      return ct == 0 ? true : false;
    } else if (this.data.type == "monster") {
      let ct = 0;
      Object.values(data.saves).forEach((el) => {
        ct += el.value;
      });
      return ct == 0 ? true : false;
    }
  }

  /* -------------------------------------------- */
  /*  Rolls                                       */
  /* -------------------------------------------- */

  rollHP(options = {}) {
    const roll = new Roll(this.data.data.hp.hd).roll({ async: false });
    return this.update({
      data: {
        hp: {
          max: roll.total,
          value: roll.total,
        },
      },
    });
  }

  rollSave(save, options = {}) {
    const label = game.i18n.localize(`WWN.saves.${save}`);
    const rollParts = ["1d20"];

    const data = {
      actor: this.data,
      roll: {
        type: "above",
        target: this.data.data.saves[save].value,
        magic:
          this.data.type === "character" ? this.data.data.scores.wis.mod : 0,
      },
      details: game.i18n.format("WWN.roll.details.save", { save: label }),
    };

    let skip = options.event && options.event.ctrlKey;

    const rollMethod =
      this.data.type == "character" ? WwnDice.RollSave : WwnDice.Roll;

    // Roll and return
    return rollMethod({
      event: options.event,
      parts: rollParts,
      data: data,
      skipDialog: skip,
      speaker: ChatMessage.getSpeaker({ actor: this }),
      flavor: game.i18n.format("WWN.roll.save", { save: label }),
      title: game.i18n.format("WWN.roll.save", { save: this.name + " - " + label }),
    });
  }

  rollMorale(options = {}) {
    const rollParts = ["2d6"];

    const data = {
      actor: this.data,
      roll: {
        type: "below",
        target: this.data.data.details.morale,
      },
    };

    // Roll and return
    return WwnDice.Roll({
      event: options.event,
      parts: rollParts,
      data: data,
      skipDialog: false,
      speaker: ChatMessage.getSpeaker({ actor: this }),
      flavor: game.i18n.localize("WWN.roll.morale"),
      title: game.i18n.localize("WWN.roll.morale"),
    });
  }

  rollInstinct(options = {}) {
    const rollParts = ["1d10"];

    const data = {
      actor: this.data,
      roll: {
        type: "instinct",
        target: this.data.data.details.instinct,
      },
    };

    // Roll and return
    return WwnDice.Roll({
      event: options.event,
      parts: rollParts,
      data: data,
      skipDialog: false,
      speaker: ChatMessage.getSpeaker({ actor: this }),
      flavor: game.i18n.localize("WWN.roll.instinct"),
      title: game.i18n.localize("WWN.roll.instinct"),
    });
  }

  rollLoyalty(options = {}) {
    const label = game.i18n.localize(`WWN.roll.loyalty`);
    const rollParts = ["2d6"];

    const data = {
      actor: this.data,
      roll: {
        type: "below",
        target: this.data.data.retainer.loyalty,
      },
    };

    // Roll and return
    return WwnDice.Roll({
      event: options.event,
      parts: rollParts,
      data: data,
      skipDialog: true,
      speaker: ChatMessage.getSpeaker({ actor: this }),
      flavor: label,
      title: label,
    });
  }

  rollReaction(options = {}) {
    const rollParts = ["2d6"];

    const data = {
      actor: this.data,
      roll: {
        type: "table",
        table: {
          2: game.i18n.format("WWN.reaction.Hostile", {
            name: this.data.name,
          }),
          3: game.i18n.format("WWN.reaction.Unfriendly", {
            name: this.data.name,
          }),
          6: game.i18n.format("WWN.reaction.Neutral", {
            name: this.data.name,
          }),
          9: game.i18n.format("WWN.reaction.Indifferent", {
            name: this.data.name,
          }),
          12: game.i18n.format("WWN.reaction.Friendly", {
            name: this.data.name,
          }),
        },
      },
    };

    let skip = options.event && options.event.ctrlKey;

    // Roll and return
    return WwnDice.Roll({
      event: options.event,
      parts: rollParts,
      data: data,
      skipDialog: skip,
      speaker: ChatMessage.getSpeaker({ actor: this }),
      flavor: game.i18n.localize("WWN.reaction.check"),
      title: game.i18n.localize("WWN.reaction.check"),
    });
  }

  rollCheck(score, options = {}) {
    const label = game.i18n.localize(`WWN.scores.${score}.long`);
    const rollParts = ["1d20"];

    const data = {
      actor: this.data,
      roll: {
        type: "check",
        target: this.data.data.scores[score].value,
      },

      details: game.i18n.format("WWN.roll.details.attribute", {
        score: label,
      }),
    };

    let skip = options.event && options.event.ctrlKey;

    // Roll and return
    return WwnDice.Roll({
      event: options.event,
      parts: rollParts,
      data: data,
      skipDialog: skip,
      speaker: ChatMessage.getSpeaker({ actor: this }),
      flavor: game.i18n.format("WWN.roll.attribute", { attribute: label }),
      title: game.i18n.format("WWN.roll.attribute", { attribute: label }),
    });
  }

  rollHitDice(options = {}) {
    const label = game.i18n.localize(`WWN.roll.hd`);
    const rollParts = new Array(this.data.data.details.level || 1).fill(this.data.data.hp.hd);
    if (this.data.type == "character") {
      rollParts.push(`${this.data.data.scores.con.mod * this.data.data.details.level}[CON]`);
    }

    const data = {
      actor: this.data,
      roll: {
        type: "hitdice",
      },
    };

    // Roll and return
    return WwnDice.Roll({
      event: options.event,
      parts: rollParts,
      data: data,
      skipDialog: true,
      speaker: ChatMessage.getSpeaker({ actor: this }),
      flavor: label,
      title: label,
    });
  }

  rollAppearing(options = {}) {
    const rollParts = [];
    let label = "";
    if (options.check == "wilderness") {
      rollParts.push(this.data.data.details.appearing.w);
      label = "(wilderness)";
    } else {
      rollParts.push(this.data.data.details.appearing.d);
      label = "(dungeon)";
    }
    const data = {
      actor: this.data,
      roll: {
        type: {
          type: "appearing",
        },
      },
    };

    // Roll and return
    return WwnDice.Roll({
      event: options.event,
      parts: rollParts,
      data: data,
      skipDialog: true,
      speaker: ChatMessage.getSpeaker({ actor: this }),
      flavor: game.i18n.format("WWN.roll.appearing", { type: label }),
      title: game.i18n.format("WWN.roll.appearing", { type: label }),
    });
  }

  rollMonsterSkill(options = {}) {
    const label = game.i18n.localize(`WWN.skill`);
    const rollParts = ["2d6"];

    const data = {
      actor: this.data,
      roll: {
        type: "skill",
        target: this.data.data.details.skill,
      },

      details: game.i18n.format("WWN.roll.details.attribute", {
        score: label,
      }),
    };

    rollParts.push(this.data.data.details.skill);
    let skip = options.event && options.event.ctrlKey;

    // Roll and return
    return WwnDice.Roll({
      event: options.event,
      parts: rollParts,
      data: data,
      skipDialog: skip,
      speaker: ChatMessage.getSpeaker({ actor: this }),
      flavor: game.i18n.format("WWN.roll.attribute", { attribute: label }),
      title: game.i18n.format("WWN.roll.attribute", { attribute: label }),
    });
  }

  rollDamage(attData, options = {}) {
    const data = this.data.data;

    const rollData = {
      actor: this.data,
      item: attData.item,
      roll: {
        type: "damage",
      },
    };

    let dmgParts = [];
    if (!attData.roll.dmg) {
      dmgParts.push("1d6");
    } else {
      dmgParts.push(attData.roll.dmg);
    }

    // Add Str to damage
    if (attData.roll.type == "melee") {
      dmgParts.push(data.scores.str.mod);
    }

    // Damage roll
    WwnDice.Roll({
      event: options.event,
      parts: dmgParts,
      data: rollData,
      skipDialog: true,
      speaker: ChatMessage.getSpeaker({ actor: this }),
      flavor: `${attData.label} - ${game.i18n.localize("WWN.Damage")}`,
      title: `${attData.label} - ${game.i18n.localize("WWN.Damage")}`,
    });
  }

  async targetAttack(data, type, options) {
    if (game.user.targets.size > 0) {
      for (let t of game.user.targets.values()) {
        data.roll.target = t;
        await this.rollAttack(data, {
          type: type,
          skipDialog: options.skipDialog,
        });
      }
    } else {
      this.rollAttack(data, { type: type, skipDialog: options.skipDialog });
    }
  }

  rollAttack(attData, options = {}) { 
    const data = this.data.data;
    const rollParts = ["1d20"];
    const dmgParts = [];
    const rollLabels = [];
    const dmgLabels = [];
    const weaponShock = attData.item.data.shock.damage;
    let statAttack, skillAttack, statValue, skillValue;
    if (data.character) {
      statAttack = attData.item.data.score;
      skillAttack = attData.item.data.skill;
      skillValue = this.items.find(item => item.type === "skill" && item.name.toLowerCase() === skillAttack).data.data.ownedLevel;
      statValue = this.data.data.scores[statAttack].mod;
    }

    let readyState = "";
    let label = game.i18n.format("WWN.roll.attacks", {
      name: this.data.name,
    });
    if (!attData.item) {
      dmgParts.push("1d6");
    } else {
      if (data.character) {
        if (attData.item.data.equipped) {
          readyState = game.i18n.format("WWN.roll.readied");
        } else if (attData.item.data.stowed) {
          readyState = game.i18n.format("WWN.roll.stowed");
        } else {
          readyState = game.i18n.format("WWN.roll.notCarried");
        }
      }
      label = game.i18n.format("WWN.roll.attacksWith", {
        name: attData.item.name,
        readyState: readyState
      });
      dmgParts.push(attData.item.data.damage);
    }

    if (data.character) {
      if (data.warrior) {
        const levelRoundedUp = Math.ceil(this.data.data.details.level / 2);
        attData.item.data.shockTotal = statValue + weaponShock + levelRoundedUp;
      } else {
        attData.item.data.shockTotal = statValue + weaponShock;
      }
      if (attData.item.data.skillShock) {
        attData.item.data.shockTotal = attData.item.data.shockTotal + skillValue;
      }
    } else {
      attData.item.data.shockTotal = this.data.data.damageBonus + attData.item.data.shock.damage;
    }

    rollParts.push(data.thac0.bba.toString());
    rollLabels.push(`+${data.thac0.bba} (attack bonus)`)

    // TODO: Add range selector in dialogue if missile attack.
    /* if (options.type == "missile") {
      rollParts.push(
        
      );
    } */
    if (data.character) {
      const unskilledAttack = attData.item.data.tags.find(weapon => weapon.title === "CB" ) ? 0 : -2;
      rollParts.push(statValue);
      rollLabels.push(`+${statValue} (${statAttack})`)
      if (skillValue == -1) {
        rollParts.push(unskilledAttack);
        rollLabels.push(`${unskilledAttack} (unskilled penalty)`)
      } else {
        rollParts.push(skillValue);
        rollLabels.push(`+${skillValue} (${skillAttack})`);
      }
    }

    if (attData.item && attData.item.data.bonus) {
      rollParts.push(attData.item.data.bonus);
      rollLabels.push(`+${attData.item.data.bonus} (weapon bonus)`);
    }
    let thac0 = data.thac0.value;

    if (data.character) {
      dmgParts.push(statValue);
      dmgLabels.push(`+${statValue} (${statAttack})`);
      if (data.warrior) {
        const levelRoundedUp = Math.ceil(data.details.level / 2);
        dmgParts.push(levelRoundedUp);
        dmgLabels.push(`+${levelRoundedUp} (warrior bonus)`);
      }
      if (attData.item.data.skillDamage) {
        dmgParts.push(skillValue);
        dmgLabels.push(`+${skillValue} (${skillAttack})`);
      }
    } else {
      dmgParts.push(this.data.data.damageBonus);
      dmgLabels.push(`+${this.data.data.damageBonus.toString()} (damage bonus)`);
    }
    
    const rollTitle = `1d20 ${rollLabels.join(" ")}`;
    const dmgTitle = `${dmgParts[0]} ${dmgLabels.join(" ")}`;

    const rollData = {
      actor: this.data,
      item: attData.item,
      roll: {
        type: options.type,
        thac0: thac0,
        dmg: dmgParts,
        save: attData.roll.save,
        target: attData.roll.target,
      },
    };

    // Roll and return
    return WwnDice.Roll({
      event: options.event,
      parts: rollParts,
      data: rollData,
      skipDialog: options.skipDialog,
      speaker: ChatMessage.getSpeaker({ actor: this }),
      flavor: label,
      title: label,
      rollTitle: rollTitle,
      dmgTitle: dmgTitle,
    });
  }

  async applyDamage(amount = 0, multiplier = 1) {
    amount = Math.floor(parseInt(amount) * multiplier);
    const hp = this.data.data.hp;

    // homebrew for negative hp values
    const min = game.settings.get("wwn", "negativeHP");

    // Remaining goes to health
    const dh = Math.clamped(hp.value - amount, min, hp.max);

    // Update the Actor
    return this.update({
      "data.hp.value": dh,
    });
  }

  static _valueFromTable(table, val) {
    let output;
    for (let i = 0; i <= val; i++) {
      if (table[i] != undefined) {
        output = table[i];
      }
    }
    return output;
  }

  async computeInit() {
    let initValue = 0;
    if (game.settings.get("wwn", "initiative") != "group") {
      if (this.data.type == "character") {
        initValue = this.data.data.scores.dex.mod + this.data.data.initiative.mod;
      } else {
        initValue = this.data.data.initiative.mod;
      }
    }
    await this.data.update({ data: { initiative: { value: initValue } } });
  }

  async setXP() {
    if (this.data.type != "character") {
      return;
    }
    const data = this.data.data;
    let xpRate = [];
    let level = data.details.level - 1;

    // Retrieve XP Settings
    switch (game.settings.get("wwn", "xpConfig")) {
      case "xpSlow":
        xpRate = [
          6,
          15,
          24,
          36,
          51,
          69,
          87,
          105,
          139
        ];
        break;
      case "xpFast":
        xpRate = [
          3,
          6,
          12,
          18,
          27,
          39,
          54,
          72,
          93
        ];
        break;
      case "xpCustom":
        xpRate = game.settings.get("wwn", "xpCustomList").split(',');
        break;
    }

    // Set character's XP to level
    await this.data.update({ data: { details: { xp: { next: xpRate[level] } } } });
  }

  async computePrepared() {
    if (!this.data.data.spells.enabled) {
      return;
    }

    // Initialize data and variables
    const data = this.data.data;
    const spells = this.data.items.filter((s) => s.type == "spell");
    let spellsPrepared = 0;

    spells.forEach((s) => {
      if (s.data.data.prepared) {
        spellsPrepared++;
      }
    });
    await this.data.update({ data: { spells: { prepared: { value: spellsPrepared } } } });
  }

  async computeEncumbrance() {
    if (this.data.type === "monster") {
      const data = this.data.data;
      await this.data.update({ data: { movement: { exploration: data.movement.base * 3 } } });
      return;
    }
    const data = this.data.data;

    // Compute encumbrance
    let totalReadied = 0;
    let totalStowed = 0;
    let maxReadied = Math.floor(data.scores.str.value / 2);
    let maxStowed = data.scores.str.value;
    const weapons = this.data.items.filter((w) => w.type == "weapon");
    const armors = this.data.items.filter((a) => a.type == "armor");
    const items = this.data.items.filter((i) => i.type == "item");

    weapons.forEach((w) => {
      if (w.data.data.equipped) {
        totalReadied += w.data.data.weight * w.data.data.quantity;
      } else if (w.data.data.stowed) {
        totalStowed += w.data.data.weight * w.data.data.quantity;
      }
    });
    armors.forEach((a) => {
      if (a.data.data.equipped) {
        totalReadied += a.data.data.weight;
      } else if (a.data.data.stowed) {
        totalStowed += a.data.data.weight;
      }
    });
    items.forEach((i) => {
      if (i.data.data.equipped) {
        totalReadied += i.data.data.weight * i.data.data.quantity;
      } else if (i.data.data.stowed) {
        totalStowed += i.data.data.weight * i.data.data.quantity;
      }
    });

    if (game.settings.get("wwn", "currencyTypes") == "currencybx") {
      let coinWeight = (data.currency.cp + data.currency.sp + data.currency.ep + data.currency.gp + data.currency.pp) / 100;
      totalStowed += coinWeight;
    } else {
      let coinWeight = (data.currency.cp + data.currency.sp + data.currency.gp) / 100;
      totalStowed += coinWeight;
    }
    await this.data.update({
      data: {
        encumbrance: {
          readied: { max: maxReadied, value: totalReadied.toFixed(2) },
          stowed: { max: maxStowed, value: totalStowed.toFixed(2) }
        }
      }
    })
  }

  async _calculateMovement() {
    if (this.data.type != "character") return;
    const data = this.data.data;
    if (data.config.movementAuto) {
      if (isNaN(data.movement.bonus)) {
        await this.data.update({ data: { movement: { bonus: 0 } } });
      }
      let newBase = data.movement.base;
      const readiedValue = data.encumbrance.readied.value;
      const readiedMax = data.encumbrance.readied.max;
      const stowedValue = data.encumbrance.stowed.value;
      const stowedMax = data.encumbrance.stowed.max;
      const bonus = data.movement.bonus;

      let systemBase = [];
      game.settings.get("wwn", "movementRate") == "movebx" ? systemBase = [40, 30, 20] : systemBase = [30, 20, 15];

      if (readiedValue <= readiedMax && stowedValue <= stowedMax) {
        newBase = systemBase[0] + bonus;
      } else if (readiedValue <= readiedMax + 2 && stowedValue <= stowedMax) {
        newBase = systemBase[1] + bonus;
      } else if (readiedValue <= readiedMax && stowedValue <= stowedMax + 4) {
        newBase = systemBase[1] + bonus;
      } else if (readiedValue <= readiedMax + 2 && stowedValue <= stowedMax + 4) {
        newBase = systemBase[2] + bonus;
      } else if (readiedValue <= readiedMax + 4 && stowedValue <= stowedMax) {
        newBase = systemBase[2] + bonus;
      } else if (readiedValue <= readiedMax && stowedValue <= stowedMax + 8) {
        newBase = systemBase[2] + bonus;
      } else {
        newBase = 0;
      }
      await this.data.update({ data: { movement: { base: newBase, exploration: newBase * 3, overland: newBase / 5 } } });
    }
  }

  // Compute Total Wealth
  async computeTotalSP() {
    const data = this.data.data;
    if (this.data.type != "character") {
      return;
    } else {
      let newTotal = data.currency.cp * 0.1 + data.currency.sp + data.currency.gp * 10 + data.currency.pp * 100 + data.currency.ep * 5 + data.currency.bank + data.treasure;
      await this.data.update({ data: { currency: { total: newTotal } } });
    }

  }

  // Compute Effort
  async computeEffort() {
    if (this.data.type === "faction" || this.data.type === "location") {
      return;
    }
    const data = this.data.data;
    if (data.spells.enabled != true) {
      return;
    }
    let effortOne = 0;
    let effortTwo = 0;
    let effortThree = 0;
    let effortFour = 0;
    let effortType1 = data.classes.effort1.name;
    let effortType2 = data.classes.effort2.name;
    let effortType3 = data.classes.effort3.name;
    let effortType4 = data.classes.effort4.name;
    const arts = this.data.items.filter((a) => a.type == "art");
    arts.forEach((a) => {
      if (effortType1 == a.data.data.source) {
        effortOne += a.data.data.effort;
      }
      if (effortType2 == a.data.data.source) {
        effortTwo += a.data.data.effort;
      }
      if (effortType3 == a.data.data.source) {
        effortThree += a.data.data.effort;
      }
      if (effortType4 == a.data.data.source) {
        effortFour += a.data.data.effort;
      }
    });
    await this.data.update({
      data: {
        classes: {
          effort1: { value: effortOne },
          effort2: { value: effortTwo },
          effort3: { value: effortThree },
          effort4: { value: effortFour }
        }
      }
    });
  }

  async computeTreasure() {
    if (this.data.type != "character") {
      return;
    }
    const data = this.data.data;
    // Compute treasure
    let total = 0;
    const treasures = this.data.items.filter(
      (i) => i.type == "item" && i.data.data.treasure
    );
    treasures.forEach((item) => {
      total += item.data.data.quantity * item.data.data.price;
    });
    await this.data.update({ data: { treasure: total } });
  }

  async computeAC() {
    if (this.data.type != "character") {
      return;
    }

    const data = this.data.data;

    // Compute AC
    let baseAac = 10;
    let AacShieldMod = 0;
    let AacShieldNaked = 0;
    let naked = baseAac + data.scores.dex.mod + data.aac.mod;
    let exertPenalty = 0;
    let sneakPenalty = 0;

    const armors = this.data.items.filter((i) => i.type == "armor");
    armors.forEach((a) => {
      if (!a.data.data.equipped) { return; };
      if (a.data.data.type != "shield") {
        baseAac = a.data.data.aac.value + a.data.data.aac.mod;
        // Check if armor is medium or heavy and apply appropriate Sneak/Exert penalty
        if (a.data.data.type === "medium" && a.data.data.weight > sneakPenalty) {
          sneakPenalty = a.data.data.weight;
        }
        if (a.data.data.type === "heavy" && a.data.data.weight > sneakPenalty) {
          sneakPenalty = a.data.data.weight;
        }
        if (a.data.data.type === "heavy" && a.data.data.weight > exertPenalty) {
          exertPenalty = a.data.data.weight;
        }
      } else if (a.data.data.type == "shield") {
        AacShieldMod = 1 + a.data.data.aac.mod;
        AacShieldNaked = a.data.data.aac.value + a.data.data.aac.mod;
      }
    });
    if (AacShieldMod > 0) {
      let shieldOnly = AacShieldNaked + data.scores.dex.mod + data.aac.mod;
      let shieldBonus = baseAac + data.scores.dex.mod + data.aac.mod + AacShieldMod;
      if (shieldOnly > shieldBonus) {
        await this.data.update({ data: { aac: { value: shieldOnly, shield: 0, naked: naked } } });
      } else {
        await this.data.update({ data: { aac: { value: shieldBonus, shield: AacShieldMod, naked: naked } } });
      }
    } else {
      await this.data.update({ data: { aac: { value: baseAac + data.scores.dex.mod + data.aac.mod, naked: naked, shield: 0 } } });
    }
    await this.data.update({ data: { skills: { sneakPenalty: sneakPenalty , exertPenalty: exertPenalty }}});
  }

  async computeModifiers() {
    if (this.data.type != "character") {
      return;
    }
    const data = this.data.data;
    const scores = data.scores;

    const standard = {
      0: -2,
      3: -2,
      4: -1,
      8: 0,
      14: 1,
      18: 2,
    };
    await Promise.all(Object.keys(scores).map(async (score) => {
      let newMod = this.data.data.scores[score].tweak + WwnActor._valueFromTable(standard, scores[score].value);
      await this.data.update({ data: { scores: { [score]: { mod: newMod } } } });
    }));

    const capped = {
      0: -2,
      3: -2,
      4: -1,
      6: -1,
      9: 0,
      13: 1,
      16: 1,
      18: 2,
    };
  }

  async computeSaves() {
    const data = this.data.data;
    const saves = data.saves;
    Object.keys(saves).forEach((s) => {
      if (!saves[s].mod) {
        saves[s].mod = 0;
      }
    });

    if (this.data.type != "character") {
      const monsterHD = data.hp.hd.toLowerCase().split('d');
      await Promise.all(Object.keys(saves).map((s) => {
        this.data.update({ data: { saves: { [s]: { value: Math.max(15 - Math.floor(monsterHD[0] / 2), 2) + saves[s].mod } } } })
      }))
    } else {
      let charLevel = data.details.level;
      let evasionVal = 16 - Math.max(data.scores.int.mod, data.scores.dex.mod) - charLevel + data.saves.evasion.mod;
      let physicalVal = 16 - Math.max(data.scores.con.mod, data.scores.str.mod) - charLevel + data.saves.physical.mod;
      let mentalVal = 16 - Math.max(data.scores.wis.mod, data.scores.cha.mod) - charLevel + data.saves.mental.mod;
      let luckVal = 16 - charLevel + data.saves.luck.mod;

      await this.data.update({
        data: {
          saves: {
            evasion: { value: evasionVal },
            physical: { value: physicalVal },
            mental: { value: mentalVal },
            luck: { value: luckVal }
          }
        }
      })
    }
  }


  // Creates a list of skills based on the following list. Was used to generate
  // the initial skills list to populate a compendium
  async createSkillsManually(data,options,user) {
    const actorData = this.data;
    const skillList = [
      "administer",
      "connect",
      "convince",
      "craft",
      "exert",
      "heal",
      "know",
      "lead",
      "magic",
      "notice",
      "perform",
      "pray",
      "punch",
      "ride",
      "sail",
      "shoot",
      "sneak",
      "stab",
      "survive",
      "trade",
      "work",
      "biopsionics",
      "metapsionics",
      "precognition",
      "telekinesis",
      "telepathy",
      "teleportation",
      "polymath",
    ];
    const skills = skillList.map((el) => {
      const skillKey = `WWN.skills.${el}`;
      const skillDesc = `WWN.skills.desc.${el}`;
      const imagePath = `/systems/wwn/assets/skills/${el}.png`
      return {
        type: "skill",
        name: game.i18n.localize(skillKey),
        data: {
          ownedLevel: -1,
          score: "int",
          description: game.i18n.localize(skillDesc),
          skillDice: "2d6",
          secondary: false,
        },
        img: imagePath,
      };
    });

    if (data.type === "character") {
      await this.createEmbeddedDocuments("Item", skills);
    }
  }

  /** @override*/
  async _onCreate(data, options, user) {
    await super._onCreate(data, options, user);
    // Add primary skills from compendium
    if (data.type === "character") {
      // If there are no skills, add ones from compendium
      if (!data.items.filter((i)=>i.type=="skill").length) {
        let skillPack = game.packs.get("wwn.skills");
        let toAdd = await skillPack.getDocuments();
        let primarySkills = toAdd.filter((i) => i.data.data.secondary == false).map(item => item.toObject());
        await this.createEmbeddedDocuments("Item", primarySkills);
      }
    }
  }

 
  // ------------------------- 
  // Added for SWB custom attributes

  _applyShorthand(data, formulaAttributes, shorthand) {
    // Handle formula attributes when the short syntax is disabled.
    for ( let [k, v] of Object.entries(data.attributes || {}) ) {
      // Make an array of formula attributes for later reference.
      if ( v.dtype === "Formula" ) formulaAttributes.push(k);
      // Add shortened version of the attributes.
      if ( !!shorthand ) {
        if ( !(k in data) ) {
          // Non-grouped attributes.
          if ( v.dtype ) {
            data[k] = v.value;
          }
          // Grouped attributes.
          else {
            data[k] = {};
            for ( let [gk, gv] of Object.entries(v) ) {
              data[k][gk] = gv.value;
              if ( gv.dtype === "Formula" ) formulaAttributes.push(`${k}.${gk}`);
            }
          }
        }
      }
    }
  }

  _applyItems(data, itemAttributes, shorthand) {
    // Map all items data using their slugified names
    data.items = this.items.reduce((obj, item) => {
      const key = item.name.slugify({strict: true});
      const itemData = item.toObject(false).data;

      // Add items to shorthand and note which ones are formula attributes.
      for ( let [k, v] of Object.entries(itemData.attributes) ) {
        // When building the attribute list, prepend the item name for later use.
        if ( v.dtype === "Formula" ) itemAttributes.push(`${key}..${k}`);
        // Add shortened version of the attributes.
        if ( !!shorthand ) {
          if ( !(k in itemData) ) {
            // Non-grouped item attributes.
            if ( v.dtype ) {
              itemData[k] = v.value;
            }
            // Grouped item attributes.
            else {
              if ( !itemData[k] ) itemData[k] = {};
              for ( let [gk, gv] of Object.entries(v) ) {
                itemData[k][gk] = gv.value;
                if ( gv.dtype === "Formula" ) itemAttributes.push(`${key}..${k}.${gk}`);
              }
            }
          }
        }
        // Handle non-shorthand version of grouped attributes.
        else {
          if ( !v.dtype ) {
            if ( !itemData[k] ) itemData[k] = {};
            for ( let [gk, gv] of Object.entries(v) ) {
              itemData[k][gk] = gv.value;
              if ( gv.dtype === "Formula" ) itemAttributes.push(`${key}..${k}.${gk}`);
            }
          }
        }
      }

      // Delete the original attributes key if using the shorthand syntax.
      if ( !!shorthand ) {
        delete itemData.attributes;
      }
      obj[key] = itemData;
      return obj;
    }, {});
  }

  _applyItemsFormulaReplacements(data, itemAttributes, shorthand) {
    for ( let k of itemAttributes ) {
      // Get the item name and separate the key.
      let item = null;
      let itemKey = k.split('..');
      item = itemKey[0];
      k = itemKey[1];

      // Handle group keys.
      let gk = null;
      if ( k.includes('.') ) {
        let attrKey = k.split('.');
        k = attrKey[0];
        gk = attrKey[1];
      }

      let formula = '';
      if ( !!shorthand ) {
        // Handle grouped attributes first.
        if ( data.items[item][k][gk] ) {
          formula = data.items[item][k][gk].replace('@item.', `@items.${item}.`);
          data.items[item][k][gk] = Roll.replaceFormulaData(formula, data);
        }
        // Handle non-grouped attributes.
        else if ( data.items[item][k] ) {
          formula = data.items[item][k].replace('@item.', `@items.${item}.`);
          data.items[item][k] = Roll.replaceFormulaData(formula, data);
        }
      }
      else {
        // Handle grouped attributes first.
        if ( data.items[item]['attributes'][k][gk] ) {
          formula = data.items[item]['attributes'][k][gk]['value'].replace('@item.', `@items.${item}.attributes.`);
          data.items[item]['attributes'][k][gk]['value'] = Roll.replaceFormulaData(formula, data);
        }
        // Handle non-grouped attributes.
        else if ( data.items[item]['attributes'][k]['value'] ) {
          formula = data.items[item]['attributes'][k]['value'].replace('@item.', `@items.${item}.attributes.`);
          data.items[item]['attributes'][k]['value'] = Roll.replaceFormulaData(formula, data);
        }
      }
    }
  }

  _applyFormulaReplacements(data, formulaAttributes, shorthand) {
    // Evaluate formula attributes after all other attributes have been handled, including items.
    for ( let k of formulaAttributes ) {
      // Grouped attributes are included as `group.attr`, so we need to split them into new keys.
      let attr = null;
      if ( k.includes('.') ) {
        let attrKey = k.split('.');
        k = attrKey[0];
        attr = attrKey[1];
      }
      // Non-grouped attributes.
      if ( data.attributes[k]?.value ) {
        data.attributes[k].value = Roll.replaceFormulaData(String(data.attributes[k].value), data);
      }
      // Grouped attributes.
      else if ( attr ) {
        data.attributes[k][attr].value = Roll.replaceFormulaData(String(data.attributes[k][attr].value), data);
      }

      // Duplicate values to shorthand.
      if ( !!shorthand ) {
        // Non-grouped attributes.
        if ( data.attributes[k]?.value ) {
          data[k] = data.attributes[k].value;
        }
        // Grouped attributes.
        else {
          if ( attr ) {
            // Initialize a group key in case it doesn't exist.
            if ( !data[k] ) {
              data[k] = {};
            }
            data[k][attr] = data.attributes[k][attr].value;
          }
        }
      }
    }
  }

  async modifyTokenAttribute(attribute, value, isDelta = false, isBar = true) {
    const current = foundry.utils.getProperty(this.data.data, attribute);
    
    const updates = {};
    if ( !isBar || !isDelta || (current?.dtype !== "Resource") ) {

      // Homebrew for negative hp
      if (attribute === "hp") {
        const min = game.settings.get("wwn", "negativeHP");
        updates[`data.hp.value`] = Math.clamped(value + (isDelta ? current.value : 0), min, current.max);
      } else {
        return super.modifyTokenAttribute(attribute, value, isDelta, isBar);
      }      
    
    } else {
      updates[`data.${attribute}.value`] = Math.clamped(current.value + value, current.min, current.max);
    }

    // standard call to hooks on change
    const allowed = Hooks.call("modifyTokenAttribute", {attribute, value, isDelta, isBar}, updates);
    return allowed !== false ? this.update(updates) : this;
  }
  
 


}
