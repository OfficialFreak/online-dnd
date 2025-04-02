export interface Speed {
    walk: number;
    fly: number;
    swim: number;
    climb: number;
    burrow: number;
}

export interface RacialTrait {
    name: string;
    description: string;
    snippet?: string;
}
  
export interface Race {
    name: string;
    baseRaceName: string;
    description: string;
    avatarUrl: string;
    portraitAvatarUrl: string;
    speed: Speed;
    racialTraits: RacialTrait[];
    size: string;
    languages: string[];
}