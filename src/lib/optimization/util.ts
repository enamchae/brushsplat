export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const randBetween = (min: number, max: number) => min + Math.random() * (max - min);

export const randBetweenExponential = (min: number, max: number) => {
    return min * Math.pow(max / min, Math.random());
};
