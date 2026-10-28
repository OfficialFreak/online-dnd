import { describe, expect, it } from "vitest";
import { Character, SKILLS, type Skill } from "../src/lib/types/character";

/**
 * Characters from D&D Beyond's character service (fixtures/ddb/<id>.json) and what D&D
 * Beyond's own sheet shows for them (fixtures/ddb/<id>.expected.json)
 */
type Expected = {
    name: string;
    abilities: Record<string, { score: number; modifier: number }>;
    saves: Record<string, number>;
    skills: Record<string, number>;
    passives: { perception: number; investigation: number; insight: number };
    initiative: number;
    armor_class: number;
    max_hp: number;
    proficiency: number;
};

const files = import.meta.glob<unknown>("./fixtures/ddb/*.json", {
    eager: true,
    import: "default",
});

const fixtures = Object.entries(files)
    .filter(([path]) => !path.endsWith(".expected.json"))
    .map(([path, data]) => ({
        id: path.match(/(\d+)\.json$/)![1],
        data,
        expected: files[path.replace(/\.json$/, ".expected.json")] as Expected,
    }));

const ABILITIES: Record<string, string> = {
    STR: "strength",
    DEX: "dexterity",
    CON: "constitution",
    INT: "intelligence",
    WIS: "wisdom",
    CHA: "charisma",
};

/** The skills by the name D&D Beyond's sheet shows */
const SKILL_NAMES: Record<string, Skill> = {
    Acrobatics: "acrobatics",
    "Animal Handling": "animal-handling",
    Arcana: "arcana",
    Athletics: "athletics",
    Deception: "deception",
    History: "history",
    Insight: "insight",
    Intimidation: "intimidation",
    Investigation: "investigation",
    Medicine: "medicine",
    Nature: "nature",
    Perception: "perception",
    Performance: "performance",
    Persuasion: "persuasion",
    Religion: "religion",
    "Sleight of Hand": "sleight-of-hand",
    Stealth: "stealth",
    Survival: "survival",
};

// The fixtures are real players' characters and stay out of this public repository: without
// them the comparisons below don't run. Fetch them anew from D&D Beyond to run the tests.
it.skipIf(fixtures.length === 0)("has fixtures with what D&D Beyond shows for each", () => {
    for (const fixture of fixtures) {
        expect(fixture.expected, fixture.id).toBeDefined();
    }
});

it("knows every skill D&D Beyond shows", () => {
    expect(Object.values(SKILL_NAMES).sort()).toEqual(
        Object.keys(SKILLS).sort(),
    );
});

for (const { id, data, expected } of fixtures)
    describe(`${expected.name} (${id})`, () => {
        const character = new Character(data);

        it("ability scores and modifiers", () => {
            const scores = character.actualStats;
            const modifiers = character.statModifiers as Record<string, number>;
            const actual = Object.fromEntries(
                Object.entries(ABILITIES).map(([abbreviation, ability]) => [
                    abbreviation,
                    { score: scores[ability], modifier: modifiers[ability] },
                ]),
            );
            expect(actual).toEqual(expected.abilities);
        });

        it("saving throws", () => {
            expect(character.savingModifiers).toEqual(expected.saves);
        });

        it("skills", () => {
            const skills = character.skillModifiers;
            const actual = Object.fromEntries(
                Object.keys(expected.skills).map((name) => [
                    name,
                    skills[SKILL_NAMES[name]],
                ]),
            );
            expect(actual).toEqual(expected.skills);
        });

        it("passive perception, investigation and insight", () => {
            expect(character.passiveSenses).toEqual(expected.passives);
        });

        it("initiative", () => {
            expect(character.actualInitiative).toBe(expected.initiative);
        });

        it("armor class", () => {
            expect(character.armorClass).toBe(expected.armor_class);
        });

        it("maximum hit points", () => {
            expect(character.maxHealth).toBe(expected.max_hp);
        });

        it("proficiency bonus", () => {
            expect(character.proficiencyBonus).toBe(expected.proficiency);
        });
    });
