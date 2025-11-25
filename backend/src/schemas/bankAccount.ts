import { z } from 'zod';

const accountHolderSchema = z
  .string()
  .min(2, 'Account holder name is required')
  .max(255, 'Account holder name is too long');

const ibanRegex = /^[A-Z0-9 ]{15,34}$/i;
const bicRegex = /^[A-Z0-9]{8}([A-Z0-9]{3})?$/i;
const achAccountRegex = /^[0-9]{4,17}$/;
const routingRegex = /^[0-9]{9}$/;

const sepaBankAccountSchema = z.object({
  scheme: z.literal('sepa'),
  accountHolderName: accountHolderSchema,
  iban: z
    .string()
    .regex(ibanRegex, 'Invalid IBAN format'),
  bic: z
    .string()
    .regex(bicRegex, 'Invalid BIC format'),
});

const achBankAccountSchema = z.object({
  scheme: z.literal('ach'),
  accountHolderName: accountHolderSchema,
  accountNumber: z
    .string()
    .regex(achAccountRegex, 'Invalid account number'),
  routingNumber: z
    .string()
    .regex(routingRegex, 'Routing number must be 9 digits'),
  accountType: z.enum(['CHECKING', 'SAVINGS']),
});

export const bankAccountSchema = z.discriminatedUnion('scheme', [
  sepaBankAccountSchema,
  achBankAccountSchema,
]);

export type BankAccountPayload = z.infer<typeof bankAccountSchema>;
