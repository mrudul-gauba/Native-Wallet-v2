import { z } from "zod";

export const onboardingSchema = z.object({
  startingBalance: z
    .string()
    .min(1, { message: "Please enter a starting balance" })
    .refine(
      (v) => {
        const parsed = parseFloat(v.replace(/,/g, ""));
        return !Number.isNaN(parsed) && parsed > 0;
      },
      { message: "Please enter a valid starting balance" },
    ),
});

export type OnboardingFormValues = z.infer<typeof onboardingSchema>;
