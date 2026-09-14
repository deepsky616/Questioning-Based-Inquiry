// 일반적인 실제 동물의 몸 구조를 기준으로 한다. 날개와 비행 능력은 별개다.
// 펭귄: https://ocean.si.edu/ocean-life/seabirds/penguins
// 나비: https://www.amnh.org/exhibitions/butterflies/metamorphosis
// 코끼리 먹이: https://www.amnh.org/explore/ology/ology-cards/115-asian-elephant
// 돌고래: https://oceanservice.noaa.gov/facts/dolphin.html
export const MYSTERY_REVIEWED_ANATOMY: Partial<Record<string, { legs: number; wings: boolean }>> = {
  puppy: { legs: 4, wings: false }, cat: { legs: 4, wings: false },
  elephant: { legs: 4, wings: false }, penguin: { legs: 2, wings: true },
  dolphin: { legs: 0, wings: false }, butterfly: { legs: 6, wings: true },
};

const NOTES: Partial<Record<string, string>> = {
  penguin: "A bird with two legs and wings adapted as swimming flippers. It cannot fly in air. Wings are not legs.",
  butterfly: "An adult insect with six legs and four wings. It is not the caterpillar stage.",
  elephant: "A land mammal with four legs and a trunk. It eats plant foods including grasses, leaves and fruit.",
  dolphin: "An aquatic mammal, not a fish. Its forelimbs are flippers, not walking legs or wings. It breathes air with lungs.",
  puppy: "A young domestic dog with four legs. It is the real animal, not a toy.",
  cat: "A domestic cat with four legs. It is the real animal, not a toy.",
};

export function mysteryItemReferenceFacts(itemId: string): string | undefined {
  return NOTES[itemId];
}
