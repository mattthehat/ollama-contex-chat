export const americanToBritish = (chunk: string): string => {
    // Words that end in -or → -our
    const orToOurWords = [
        'color',
        'favor',
        'flavor',
        'honor',
        'humor',
        'labor',
        'neighbor',
        'rumor',
        'splendor',
        'vapor',
        'vigor',
        'ardor',
        'candor',
        'clamor',
        'demeanor',
        'endeavor',
        'fervor',
        'harbor',
        'odor',
        'parlor',
        'rancor',
        'rigor',
        'savior',
        'savory',
        'valor',
        'behavior',
        'glamor',
        'tumor',
    ];

    // Words that end in -ize/-yze → -ise/-yse
    const izeToIseStems = [
        'real',
        'organ',
        'modern',
        'character',
        'civil',
        'colon',
        'special',
        'general',
        'legal',
        'final',
        'central',
        'personal',
        'national',
        'social',
        'visual',
        'normal',
        'local',
        'moral',
        'neutral',
        'natural',
        'criminal',
        'partial',
        'capital',
        'hospital',
        'formal',
        'digital',
        'vital',
        'total',
        'royal',
        'brutal',
        'serial',
        'material',
        'memorial',
        'editorial',
        'itual',
        'standard',
        'custom',
        'minim',
        'maxim',
        'vocal',
        'ideal',
        'emphas',
        'summar',
        'categor',
        'apolog',
        'recogn',
        'critic',
        'symbol',
        'util',
        'stabil',
        'mobil',
        'author',
        'terror',
        'popular',
        'familiar',
        'regular',
        'secular',
        'similar',
        'particular',
        'polar',
        'solar',
        'amateur',
        'civil',
        'anal',
        'paral',
        'met',
        'epitom',
        'synthes',
        'hypothes',
        'emuls',
        'decentral',
    ];

    const yzeToYseWords = [
        'analyze',
        'paralyze',
        'catalyze',
        'hydrolyze',
        'electrolyze',
    ];

    // Words that end in -er → -re
    const erToReWords = [
        'center',
        'fiber',
        'liter',
        'meter',
        'theater',
        'saber',
        'somber',
        'caliber',
        'meager',
        'scepter',
        'specter',
        'maneuver',
        'louver',
    ];

    // Words that end in -ense → -ence
    const enseToEnceWords = ['defense', 'offense', 'license', 'pretense'];

    // Words that double the final L in British
    const doubleL = [
        { us: 'traveling', uk: 'travelling' },
        { us: 'traveled', uk: 'travelled' },
        { us: 'traveler', uk: 'traveller' },
        { us: 'canceled', uk: 'cancelled' },
        { us: 'canceling', uk: 'cancelling' },
        { us: 'labeled', uk: 'labelled' },
        { us: 'labeling', uk: 'labelling' },
        { us: 'modeling', uk: 'modelling' },
        { us: 'modeled', uk: 'modelled' },
        { us: 'counselor', uk: 'counsellor' },
        { us: 'counseling', uk: 'counselling' },
        { us: 'leveled', uk: 'levelled' },
        { us: 'leveling', uk: 'levelling' },
        { us: 'fueled', uk: 'fuelled' },
        { us: 'fueling', uk: 'fuelling' },
    ];

    // Other common exceptions
    const exceptions: Record<string, string> = {
        gray: 'grey',
        check: 'cheque', // only for the payment instrument
        program: 'programme', // except in computing context
        tire: 'tyre', // only for the wheel
        aluminum: 'aluminium',
        mom: 'mum',
        math: 'maths',
        airplane: 'aeroplane',
        esthetic: 'aesthetic',
        anesthesia: 'anaesthesia',
        catalog: 'catalogue',
        dialog: 'dialogue',
        jewelry: 'jewellery',
        pajamas: 'pyjamas',
        plow: 'plough',
        skeptical: 'sceptical',
        skillful: 'skilful',
        story: 'storey', // only for building levels
    };

    const preserveCase = (original: string, replacement: string): string => {
        if (original === original.toUpperCase()) {
            return replacement.toUpperCase();
        }
        if (original[0] === original[0].toUpperCase()) {
            return replacement.charAt(0).toUpperCase() + replacement.slice(1);
        }
        return replacement;
    };

    let result = chunk;

    // Apply -or → -our transformations
    orToOurWords.forEach((word) => {
        const pattern = new RegExp(`\\b(${word})\\b`, 'gi');
        result = result.replace(pattern, (match) =>
            preserveCase(match, word.replace(/or$/, 'our'))
        );
    });

    // Apply -ize → -ise transformations (including derivatives like -ization)
    izeToIseStems.forEach((stem) => {
        const patterns = [
            { from: new RegExp(`\\b(${stem}ize)\\b`, 'gi'), to: `${stem}ise` },
            {
                from: new RegExp(`\\b(${stem}ization)\\b`, 'gi'),
                to: `${stem}isation`,
            },
            {
                from: new RegExp(`\\b(${stem}izing)\\b`, 'gi'),
                to: `${stem}ising`,
            },
            {
                from: new RegExp(`\\b(${stem}ized)\\b`, 'gi'),
                to: `${stem}ised`,
            },
            {
                from: new RegExp(`\\b(${stem}izer)\\b`, 'gi'),
                to: `${stem}iser`,
            },
        ];
        patterns.forEach(({ from, to }) => {
            result = result.replace(from, (match) => preserveCase(match, to));
        });
    });

    // Apply -yze → -yse transformations
    yzeToYseWords.forEach((word) => {
        const stem = word.replace(/yze$/, '');
        const patterns = [
            { from: new RegExp(`\\b(${word})\\b`, 'gi'), to: `${stem}yse` },
            {
                from: new RegExp(`\\b(${stem}yzing)\\b`, 'gi'),
                to: `${stem}ysing`,
            },
            {
                from: new RegExp(`\\b(${stem}yzed)\\b`, 'gi'),
                to: `${stem}ysed`,
            },
            {
                from: new RegExp(`\\b(${stem}yzer)\\b`, 'gi'),
                to: `${stem}yser`,
            },
        ];
        patterns.forEach(({ from, to }) => {
            result = result.replace(from, (match) => preserveCase(match, to));
        });
    });

    // Apply -er → -re transformations
    erToReWords.forEach((word) => {
        const pattern = new RegExp(`\\b(${word})\\b`, 'gi');
        result = result.replace(pattern, (match) =>
            preserveCase(match, word.replace(/er$/, 're'))
        );
    });

    // Apply -ense → -ence transformations
    enseToEnceWords.forEach((word) => {
        const pattern = new RegExp(`\\b(${word})\\b`, 'gi');
        result = result.replace(pattern, (match) =>
            preserveCase(match, word.replace(/ense$/, 'ence'))
        );
    });

    // Apply double L transformations
    doubleL.forEach(({ us, uk }) => {
        const pattern = new RegExp(`\\b(${us})\\b`, 'gi');
        result = result.replace(pattern, (match) => preserveCase(match, uk));
    });

    // Apply exceptions
    Object.entries(exceptions).forEach(([us, uk]) => {
        const pattern = new RegExp(`\\b(${us})\\b`, 'gi');
        result = result.replace(pattern, (match) => preserveCase(match, uk));
    });

    return result;
};
