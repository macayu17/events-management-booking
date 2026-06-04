import { Prisma } from '@prisma/client';
import prisma from '../config/db.js';
import {
  findInvalidPollOptionIds,
  normalizePollVoteSelection,
} from '../utils/poll-vote.util.js';

const withStatus = (message, statusCode = 500) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const assertPollCanReceiveVotes = (poll) => {
  if (!poll || !poll.event?.published) {
    throw withStatus('Poll not found', 404);
  }

  if (!poll.isActive) {
    throw withStatus('Poll is closed', 400);
  }

  if (poll.endsAt && new Date(poll.endsAt) <= new Date()) {
    throw withStatus('Poll has ended', 400);
  }
};

const createVotes = async (tx, selectedOptionIds, voterEmail) => {
  const result = await tx.pollVote.createMany({
    data: selectedOptionIds.map((optionId) => ({
      optionId,
      voterEmail,
    })),
    skipDuplicates: true,
  });

  if (result.count === 0) {
    throw withStatus('You have already voted for the selected option', 400);
  }

  return result.count;
};

export async function recordPollVote({ pollId, optionId, optionIds, voterEmail }) {
  const normalizedEmail = String(voterEmail || '').trim().toLowerCase();

  const runVote = () => prisma.$transaction(async (tx) => {
    const poll = await tx.poll.findUnique({
      where: { id: pollId },
      include: {
        event: { select: { published: true } },
        options: { select: { id: true } },
      },
    });

    assertPollCanReceiveVotes(poll);

    const selectedOptionIds = normalizePollVoteSelection(
      { optionId, optionIds },
      poll.allowMultiple
    );
    const invalidOptionIds = findInvalidPollOptionIds(poll.options, selectedOptionIds);

    if (invalidOptionIds.length > 0) {
      throw withStatus('Invalid option', 400);
    }

    if (!poll.allowMultiple) {
      const existingVote = await tx.pollVote.findFirst({
        where: {
          voterEmail: normalizedEmail,
          option: { pollId },
        },
        select: { id: true },
      });

      if (existingVote) {
        throw withStatus('You have already voted on this poll', 400);
      }
    } else {
      const existingVotes = await tx.pollVote.findMany({
        where: {
          voterEmail: normalizedEmail,
          optionId: { in: selectedOptionIds },
        },
        select: { optionId: true },
      });
      const existingOptionIds = new Set(existingVotes.map((vote) => vote.optionId));
      const newOptionIds = selectedOptionIds.filter((id) => !existingOptionIds.has(id));

      if (newOptionIds.length === 0) {
        throw withStatus('You have already voted for the selected option', 400);
      }

      const createdCount = await createVotes(tx, newOptionIds, normalizedEmail);
      return {
        success: true,
        createdCount,
        optionIds: newOptionIds,
      };
    }

    const createdCount = await createVotes(tx, selectedOptionIds, normalizedEmail);
    return {
      success: true,
      createdCount,
      optionIds: selectedOptionIds,
    };
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    maxWait: 10000,
    timeout: 30000,
  });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await runVote();
    } catch (error) {
      if (['P2028', 'P2034'].includes(error.code) && attempt < 2) {
        continue;
      }

      if (error.code === 'P2002') {
        throw withStatus('You have already voted for this option', 400);
      }

      throw error;
    }
  }

  throw withStatus('Failed to record vote', 500);
}
