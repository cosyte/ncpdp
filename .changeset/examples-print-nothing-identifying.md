---
"@cosyte/ncpdp": patch
---

Documentation only: no README or example sample prints a value that identifies a person. Samples read a name, a date of birth, a cardholder or prescription number or a sig into a variable and show its synthetic value in a comment, and print only message types, codes, counts and lengths. The "What is safe to log" section of How the parser reads safely now says that no field of a warning or typed error holds raw input, and that a parsed value should not be passed to a logger. No code changed, and a caller has nothing to change.
