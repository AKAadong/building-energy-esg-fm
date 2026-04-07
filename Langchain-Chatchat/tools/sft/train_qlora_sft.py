import argparse
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List

import torch
from datasets import Dataset
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
from peft import LoraConfig, get_peft_model
from trl import SFTTrainer, SFTConfig


@dataclass
class Sample:
    messages: List[Dict[str, str]]


def load_jsonl(path: Path) -> List[Sample]:
    samples: List[Sample] = []
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            obj = json.loads(line)
            samples.append(Sample(messages=obj["messages"]))
    return samples


def main():
    p = argparse.ArgumentParser(description="QLoRA SFT for Qwen2.5-7B-Instruct (messages jsonl).")
    p.add_argument("--base-model", required=True, help="HF model id or local path, e.g. Qwen/Qwen2.5-7B-Instruct")
    p.add_argument("--train-file", required=True, help="jsonl with {messages:[...]}")
    p.add_argument("--output-dir", required=True)
    p.add_argument("--max-seq-len", type=int, default=2048)
    p.add_argument("--learning-rate", type=float, default=2e-4)
    p.add_argument("--num-train-epochs", type=float, default=1.0)
    p.add_argument("--per-device-train-batch-size", type=int, default=1)
    p.add_argument("--gradient-accumulation-steps", type=int, default=8)
    p.add_argument("--logging-steps", type=int, default=10)
    p.add_argument("--save-steps", type=int, default=200)
    p.add_argument("--warmup-ratio", type=float, default=0.03)
    p.add_argument("--lr-scheduler-type", type=str, default="cosine")
    p.add_argument("--lora-r", type=int, default=16)
    p.add_argument("--lora-alpha", type=int, default=32)
    p.add_argument("--lora-dropout", type=float, default=0.05)
    args = p.parse_args()

    # Tokenizer
    tokenizer = AutoTokenizer.from_pretrained(args.base_model, use_fast=True, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    # 4-bit quantized model for QLoRA
    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_use_double_quant=True,
        bnb_4bit_compute_dtype=torch.bfloat16 if torch.cuda.is_available() else torch.float32,
    )

    model = AutoModelForCausalLM.from_pretrained(
        args.base_model,
        quantization_config=bnb_config,
        device_map="auto",
        trust_remote_code=True,
    )
    model.config.use_cache = False

    # Qwen family: common target modules for attention/MLP projections
    lora = LoraConfig(
        r=args.lora_r,
        lora_alpha=args.lora_alpha,
        lora_dropout=args.lora_dropout,
        bias="none",
        task_type="CAUSAL_LM",
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
    )
    model = get_peft_model(model, lora)

    samples = load_jsonl(Path(args.train_file))
    ds = Dataset.from_list([{"messages": s.messages} for s in samples])

    def format_chat(example: Dict[str, Any]) -> str:
        # Use tokenizer chat template when available (Qwen provides chat template)
        return tokenizer.apply_chat_template(example["messages"], tokenize=False, add_generation_prompt=False)

    sft_cfg = SFTConfig(
        output_dir=args.output_dir,
        max_seq_length=args.max_seq_len,
        learning_rate=args.learning_rate,
        num_train_epochs=args.num_train_epochs,
        per_device_train_batch_size=args.per_device_train_batch_size,
        gradient_accumulation_steps=args.gradient_accumulation_steps,
        logging_steps=args.logging_steps,
        save_steps=args.save_steps,
        warmup_ratio=args.warmup_ratio,
        lr_scheduler_type=args.lr_scheduler_type,
        bf16=torch.cuda.is_available(),
        fp16=False,
        report_to=[],
    )

    trainer = SFTTrainer(
        model=model,
        tokenizer=tokenizer,
        train_dataset=ds,
        formatting_func=format_chat,
        args=sft_cfg,
    )
    trainer.train()
    trainer.save_model(args.output_dir)
    tokenizer.save_pretrained(args.output_dir)


if __name__ == "__main__":
    main()

