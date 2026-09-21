# Portfolio registry example

This registry intentionally maps only the Armonia checkout. Replace the entry
with repositories you are authorized to inspect, and keep sensitive repository
names, paths, or results out of a committed snapshot unless you explicitly want
them public.

```bash
node ../../bin/armonia.mjs portfolio \
  --registry registry.json \
  --output ../../.armonia/portfolio-snapshot.json
```
