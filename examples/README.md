# Archived demonstration results

This directory contains the reproducible cold-start experiment and one common-source amplifier design from the educational analytical model.

- `training-report.json`: candidate policies, validation decisions, and held-out task metrics.
- `policy.json`: the learned sampling policy from that experiment.
- `latest-design.json`: example dimensions and the three demonstration corners.
- `latest-design.cir`: a LEVEL=1 demonstration netlist, not a foundry PDK.

Run `node verify.cjs` from the repository root to check the model and reproduce the first archived policy update. Your own runs write to the ignored `data/` directory.
