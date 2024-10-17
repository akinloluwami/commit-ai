import { Command } from "commander";
import { execa } from "execa";
import inquirer from "inquirer";
import OpenAI from "openai";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";

dotenv.config();

const program = new Command();

const CONFIG_FILE_PATH = path.join(__dirname, ".env");

const promptResponse = z.array(z.string());

const generateCommitMessages = async (diff: string) => {
  const client = new OpenAI({
    apiKey: process.env["OPENAI_API_KEY"],
  });

  const prompt = `Generate an array of three git commit messages for the following changes:\n${diff}`;

  const { choices } = await client.chat.completions.create({
    model: "chatgpt-4o-latest",
    messages: [{ role: "user", content: prompt }],
    response_format: zodResponseFormat(promptResponse, "prompt-response"),
  });

  return [];
};

const getGitDiff = async (): Promise<string> => {
  try {
    const { stdout } = await execa("git", ["diff"]);
    return stdout;
  } catch (error) {
    console.error("Error getting git diff:", error);
    throw error;
  }
};

const commitChanges = async (message: string): Promise<void> => {
  try {
    await execa("git", ["add", "."]);
    await execa("git", ["commit", "-m", message]);
    console.log(`Committed with message: "${message}"`);
  } catch (error) {
    console.error("Error committing changes:", error);
    throw error;
  }
};

const askToPush = async () => {
  const { push } = await inquirer.prompt({
    type: "confirm",
    name: "push",
    message: "Do you want to push the changes?",
  });

  if (push) {
    try {
      await execa("git", ["push"]);
      console.log("Changes pushed successfully!");
    } catch (error) {
      console.error("Error pushing changes:", error);
    }
  }
};

const setToken = async (): Promise<void> => {
  const { token } = await inquirer.prompt({
    type: "password",
    name: "token",
    message: "Enter your OpenAI API token:",
    validate: (input: string) =>
      input.length === 0 ? "Token cannot be empty" : true,
  });

  fs.writeFileSync(CONFIG_FILE_PATH, `OPENAI_API_KEY=${token}`);
  console.log("OpenAI API token set successfully!");
};

const startCommitProcess = async (auto: boolean): Promise<void> => {
  try {
    const diff = await getGitDiff();
    if (!diff) {
      console.log("No changes to commit.");
      return;
    }

    const commitMessages = await generateCommitMessages(diff);

    let chosenMessage: string;

    if (auto) {
      chosenMessage = commitMessages[0];
      console.log(`Auto-selected commit message: "${chosenMessage}"`);
    } else {
      const { selectedMessage } = await inquirer.prompt({
        type: "list",
        name: "selectedMessage",
        message: "Select a commit message:",
        choices: commitMessages,
      });
      chosenMessage = selectedMessage;
    }

    await commitChanges(chosenMessage);

    await askToPush();
  } catch (error) {
    console.error("Error:", error);
  }
};

program
  .command("set token")
  .description("Set OpenAI API token")
  .action(setToken);

program
  .command("start")
  .description("Start the commit process")
  .option("--auto", "Auto-select commit message without asking")
  .action((options) => startCommitProcess(options.auto));

program.parse(process.argv);
