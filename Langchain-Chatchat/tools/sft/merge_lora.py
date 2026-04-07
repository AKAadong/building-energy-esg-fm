import argparse
from pathlib import Path

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel


def main():
    p = argparse.ArgumentParser(description="Merge LoRA adapter into base model (produce deployable model dir).")
    p.add_argument("--base-model", required=True, help="HF model id or local path")
    p.add_argument("--lora-dir", required=True, help="LoRA adapter directory (output of train script)")
    p.add_argument("--output-dir", required=True, help="Merged model output directory")
    p.add_argument("--dtype", default="bfloat16", choices=["float16", "bfloat16", "float32"])
    args = p.parse_args()

    dtype = {
        "float16": torch.float16,
        "bfloat16": torch.bfloat16,
        "float32": torch.float32,
    }[args.dtype]

    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    tokenizer = AutoTokenizer.from_pretrained(args.base_model, use_fast=True, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    base = AutoModelForCausalLM.from_pretrained(
        args.base_model,
        device_map="cpu",
        torch_dtype=dtype,
        trust_remote_code=True,
    )
    model = PeftModel.from_pretrained(base, args.lora_dir)
    model = model.merge_and_unload()

    model.save_pretrained(out_dir, safe_serialization=True, max_shard_size="2GB")
    tokenizer.save_pretrained(out_dir)

    print(f"merged_model_saved_to={out_dir.resolve()}")


if __name__ == "__main__":
    main()

import argparse
from pathlib import Path

import torch
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer


def main():
    p = argparse.ArgumentParser(description="Merge LoRA adapter into base model for deployment.")
    p.add_argument("--base-model", required=True, help="HF model id or local base model path")
    p.add_argument("--lora-dir", required=True, help="LoRA adapter dir (trainer output)")
    p.add_argument("--output-dir", required=True, help="merged model output dir")
    args = p.parse_args()

    out = Path(args.output_dir)
    out.mkdir(parents=True, exist_ok=True)

    tokenizer = AutoTokenizer.from_pretrained(args.base_model, use_fast=True, trust_remote_code=True)
    model = AutoModelForCausalLM.from_pretrained(
        args.base_model,
        torch_dtype=torch.float16 if torch.cuda.is_available() else torch.float32,
        device_map="auto",
        trust_remote_code=True,
    )
    model = PeftModel.from_pretrained(model, args.lora_dir)
    merged = model.merge_and_unload()

    merged.save_pretrained(out, safe_serialization=True)
    tokenizer.save_pretrained(out)


if __name__ == "__main__":
    main()

