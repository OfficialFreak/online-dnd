export interface CharacterDecorations {
    avatarUrl: string;
    portraitAvatarUrl?: string;
    frameAvatarUrl: string | null;
    backdropAvatarUrl: string;
    smallBackdropAvatarUrl: string;
    largeBackdropAvatarUrl: string;
    thumbnailBackdropAvatarUrl: string;
    themeColor?: {
        themeColor: string;
        backgroundColor: string;
        name: string;
    };
}