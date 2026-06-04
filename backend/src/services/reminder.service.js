/**
 * Event Reminder Service
 * 
 * Processes and sends event reminders to registered attendees.
 * Should be called periodically (e.g., every hour via cron job).
 */

import prisma from '../config/db.js';
import { sendTextEmail } from './email.service.js';

/**
 * Process all pending reminders
 * Call this function from a cron job or scheduled task
 */
export async function processReminders() {
    console.log('Processing event reminders...');

    try {
        const now = new Date();

        // Find all active reminders that haven't been sent yet
        const reminders = await prisma.eventReminder.findMany({
            where: {
                isActive: true,
                sentAt: null
            },
            include: {
                event: {
                    include: {
                        registrations: {
                            where: {
                                status: { in: ['PAID', 'CONFIRMED'] }
                            },
                            select: {
                                userEmail: true,
                                formResponse: true
                            }
                        }
                    }
                }
            }
        });

        let sentCount = 0;

        for (const reminder of reminders) {
            const event = reminder.event;
            const eventTime = new Date(event.startTime);
            const reminderTime = new Date(eventTime.getTime() - (reminder.hoursBeforeEvent * 60 * 60 * 1000));

            // Check if it's time to send this reminder
            if (now >= reminderTime && now < eventTime) {
                console.log(`Sending reminder for event: ${event.title}`);

                const recipients = [...new Set(event.registrations.map(r => r.userEmail))];

                if (recipients.length > 0) {
                    // Send emails to all recipients
                    for (const email of recipients) {
                        const registration = event.registrations.find(r => r.userEmail === email);
                        const attendeeName = registration?.formResponse?.name || 'Attendee';

                        const personalize = (template) => String(template || '')
                            .replace(/\{name\}/g, attendeeName)
                            .replace(/\{event\}/g, event.title)
                            .replace(/\{date\}/g, eventTime.toLocaleDateString())
                            .replace(/\{time\}/g, eventTime.toLocaleTimeString())
                            .replace(/\{location\}/g, event.location);

                        const personalizedSubject = personalize(reminder.subject);
                        const personalizedMessage = personalize(reminder.message);

                        try {
                            await sendTextEmail(email, personalizedSubject, personalizedMessage);
                            sentCount++;
                        } catch (emailError) {
                            console.error(`Failed to send reminder to ${email}:`, emailError);
                        }
                    }

                    // Mark reminder as sent
                    await prisma.eventReminder.update({
                        where: { id: reminder.id },
                        data: { sentAt: new Date() }
                    });

                    console.log(`Reminder sent to ${recipients.length} recipients for: ${event.title}`);
                }
            }
        }

        console.log(`Reminder processing complete. Sent ${sentCount} emails.`);
        return { success: true, sentCount };

    } catch (error) {
        console.error('Reminder processing error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Create default reminders for a new event
 */
export async function createDefaultReminders(eventId) {
    try {
        await prisma.eventReminder.createMany({
            data: [
                {
                    eventId,
                    hoursBeforeEvent: 24,
                    subject: 'Event Tomorrow: {event}',
                    message: `Hi {name},\n\nThis is a reminder that {event} is happening tomorrow!\n\n📅 Date: {date}\n⏰ Time: {time}\n📍 Location: {location}\n\nDon't forget to bring your ticket.\n\nSee you there!\n\n- The Occasio Team`
                },
                {
                    eventId,
                    hoursBeforeEvent: 2,
                    subject: 'Starting Soon: {event}',
                    message: `Hi {name},\n\n{event} starts in 2 hours!\n\n📍 Location: {location}\n⏰ Time: {time}\n\nMake sure you're on your way.\n\n- The Occasio Team`
                }
            ]
        });

        console.log('Default reminders created for event:', eventId);
    } catch (error) {
        console.error('Error creating default reminders:', error);
    }
}
